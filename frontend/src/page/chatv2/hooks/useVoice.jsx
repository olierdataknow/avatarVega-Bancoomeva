import { useState, useRef, useCallback } from "react";

export function useVoiceAssistant({ setMsg }) {
  // idle → sin conexión | Conectando | Escuchando (conectado) | Hablando | Pensando
  const [status, setStatus] = useState("idle");
  const [isConnected, setIsConnected] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [analyzerData, setAnalyzerData] = useState(null);

  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const workletLoadedRef = useRef(false);
  const mediaStreamRef = useRef(null);
  const micNodesRef = useRef(null);
  const wsRef = useRef(null);
  const connectingRef = useRef(null);
  const queueTimeRef = useRef(undefined);
  const assistantSourcesRef = useRef([]);
  const partialBufRef = useRef("");
  // Una respuesta pedida por escrito llega sin audio; si el modelo lo emitiera
  // igual, se ignora para no hacer hablar al avatar cuando se preguntó por texto.
  const textResponseRef = useRef(false);
  const responseActiveRef = useRef(false);

  const ensureAudioCtx = () =>
    audioCtxRef.current ||
    (audioCtxRef.current = new AudioContext({ sampleRate: 24000 }));

  const int16ToFloat32 = (int16) => {
    const f32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      const int = int16[i];
      f32[i] = int < 0 ? int / 0x8000 : int / 0x7fff;
    }
    return f32;
  };

  const stopAssistantAudio = () => {
    assistantSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {}
    });
    assistantSourcesRef.current = [];
    if (audioCtxRef.current) {
      queueTimeRef.current = audioCtxRef.current.currentTime;
    }
  };

  const playChunk = (base64) => {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const int16 = new Int16Array(bytes.buffer);
    const f32 = int16ToFloat32(int16);

    const ctx = ensureAudioCtx();

    // Crear analyser si no existe
    if (!analyserRef.current) {
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 2048;
      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      setAnalyzerData({
        analyzer: analyserRef.current,
        bufferLength,
        dataArray,
      });
    }

    if (queueTimeRef.current === undefined) {
      queueTimeRef.current = ctx.currentTime;
    }

    const buf = ctx.createBuffer(1, f32.length, 24000);
    buf.copyToChannel(f32, 0);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    // Conectar a analyser y luego a destino
    src.connect(analyserRef.current);
    analyserRef.current.connect(ctx.destination);

    const startAt = Math.max(queueTimeRef.current, ctx.currentTime + 0.05);
    src.start(startAt);
    queueTimeRef.current = startAt + buf.duration;

    assistantSourcesRef.current.push(src);
    src.onended = () => {
      assistantSourcesRef.current = assistantSourcesRef.current.filter(
        (s) => s !== src
      );
      if (assistantSourcesRef.current.length === 0) {
        setStatus("Escuchando");
      }
    };
  };

  const handleServerMessage = (ev) => {
    const m = JSON.parse(ev.data);
    switch (m.type) {
      case "assistant.audio":
        if (textResponseRef.current) break; // respuesta escrita: sin voz
        setStatus("Hablando");
        playChunk(m.audio);
        break;
      case "transcript.delta":
        partialBufRef.current += m.text;
        break;
      case "transcript.final":
        partialBufRef.current = "";
        if (m.role === "assistant" && m.mode !== "text") setStatus("Hablando");
        if (m.role === "assistant" && m.mode === "text") setStatus("Escuchando");
        setMsg((prev) => [
          ...prev,
          { role: m.role, value: m.text, mode: m.mode || "audio" },
        ]);
        break;
      case "speech_started":
        // Al volver a hablar se recupera la voz del avatar: el modo silencioso
        // dura mientras la conversación siga siendo escrita (una pregunta que
        // usa la búsqueda genera dos respuestas, no basta con response.done).
        textResponseRef.current = false;
        setStatus("Escuchando");
        stopAssistantAudio();
        break;
      case "response.created":
        responseActiveRef.current = true;
        break;
      case "response.done":
        responseActiveRef.current = false;
        break;
      case "tool_result":
        break;
    }
  };

  const stopMicTracks = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (micNodesRef.current) {
      try {
        micNodesRef.current.source.disconnect();
        micNodesRef.current.node.disconnect();
      } catch {}
      micNodesRef.current = null;
    }
  };

  const handleClose = () => {
    wsRef.current = null;
    connectingRef.current = null;
    stopMicTracks();
    stopAssistantAudio();
    partialBufRef.current = "";
    responseActiveRef.current = false;
    textResponseRef.current = false;
    queueTimeRef.current = undefined;
    setMicOn(false);
    setIsConnected(false);
    setStatus("idle");
  };

  /**
   * Abre la sesión realtime. No pide micrófono: así se puede preguntar por
   * escrito en equipos sin micrófono o sin dar el permiso del navegador.
   */
  const connect = useCallback(({ greet = false } = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return Promise.resolve(wsRef.current);
    }
    if (connectingRef.current) return connectingRef.current;

    setStatus("Conectando");

    // La URL sale de .env.development (local) o .env.production (imagen
    // Docker). Sin ella se asume el mismo origen que sirve la página.
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    const url =
      import.meta.env.VITE_REALTIME_URL || `${proto}//${location.host}/realtime`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = handleServerMessage;
    ws.onclose = handleClose;

    connectingRef.current = new Promise((resolve, reject) => {
      ws.onopen = async () => {
        ws.send(JSON.stringify({ type: "session.update", session: {} }));
        connectingRef.current = null;
        setIsConnected(true);
        setStatus("Escuchando");
        resolve(ws);
        if (greet) await playWelcomeAudio();
      };
      ws.onerror = (err) => {
        connectingRef.current = null;
        setStatus("idle");
        reject(err);
      };
    });

    return connectingRef.current;
  }, []);

  /** Activa el micrófono (conecta la sesión si aún no lo está). */
  const startMic = useCallback(async () => {
    if (micOn) return;

    await connect({ greet: true });

    const ctx = ensureAudioCtx();
    if (!workletLoadedRef.current) {
      await ctx.audioWorklet.addModule("/recorder-worklet.js");
      workletLoadedRef.current = true;
    }

    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    const source = ctx.createMediaStreamSource(mediaStreamRef.current);
    const node = new AudioWorkletNode(ctx, "recorder-processor");
    source.connect(node);
    node.connect(ctx.destination);
    micNodesRef.current = { source, node };

    node.port.onmessage = (ev) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
      const int16 = new Int16Array(ev.data);
      const bytes = new Uint8Array(int16.buffer);
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      const base64 = btoa(bin);
      wsRef.current.send(
        JSON.stringify({ type: "input_audio_buffer.append", audio: base64 })
      );
    };

    setMicOn(true);
  }, [micOn, connect]);

  /** Apaga el micrófono pero deja la sesión abierta para seguir por escrito. */
  const stopMic = useCallback(() => {
    stopMicTracks();
    setMicOn(false);
  }, []);

  /** Envía una pregunta escrita y pide respuesta solo de texto (sin voz). */
  const sendText = useCallback(
    async (text) => {
      const clean = (text || "").trim();
      if (!clean) return;

      const ws = await connect();

      // Interrumpe lo que esté sonando o generándose: el servidor rechaza un
      // response.create mientras haya otra respuesta activa.
      stopAssistantAudio();
      if (responseActiveRef.current) {
        ws.send(JSON.stringify({ type: "response.cancel" }));
        responseActiveRef.current = false;
      }

      setMsg((prev) => [...prev, { role: "user", value: clean, mode: "text" }]);
      textResponseRef.current = true;

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: clean }],
          },
        })
      );
      ws.send(
        JSON.stringify({
          type: "response.create",
          response: { output_modalities: ["text"] },
        })
      );

      setStatus("Pensando");
    },
    [connect, setMsg]
  );

  /** Cierra la sesión completa (micrófono + websocket). */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    handleClose();
  }, []);

  async function playWelcomeAudio() {
    return new Promise((resolve) => {
      // Usar la ruta relativa a public
      const welcome = new Audio("/bienvenida.wav");

      // Crear contexto de audio
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

      // Crear un source desde el <audio>
      const source = audioCtx.createMediaElementSource(welcome);

      // Crear analyzer
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256; // puedes ajustar según el detalle que quieras
      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      // Conectar source → analyzer → destino
      source.connect(analyzer);
      analyzer.connect(audioCtx.destination);

      // Guardar en estado para que WaveFormCircle lo use
      setAnalyzerData({ analyzer, dataArray });

      setMsg((prev) => [
        ...prev,
        {
          role: "assistant",
          value: "Hola. ¿En qué puedo ayudarte hoy?",
          mode: "audio",
        },
      ]);
      setStatus("Hablando");

      welcome.play();

      welcome.onended = () => {
        setStatus("Escuchando");
        resolve();
      };
    });
  }

  return {
    connect,
    disconnect,
    startMic,
    stopMic,
    sendText,
    status,
    isConnected,
    micOn,
    analyzerData,
    setAnalyzerData,
  };
}
