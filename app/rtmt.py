import aiohttp
from aiohttp import ClientWebSocketResponse, web
import asyncio
import json
import traceback
from typing import Any, Callable, Awaitable
from datetime import datetime, timezone, timedelta

# Colombia siempre está en UTC-5 (sin horario de verano desde 1993), así que usamos
# un offset fijo en vez de zoneinfo/ZoneInfo: éste depende de la base de datos IANA
# de zonas horarias, que NO viene instalada por defecto en Windows ni en algunos
# entornos mínimos (falla con "No time zone found with key America/Bogota"),
# rompiendo silenciosamente el envío de session.update (instructions + tools).
COLOMBIA_TZ = timezone(timedelta(hours=-5))

def _make_str(x): 
    return x if isinstance(x, str) else json.dumps(x, ensure_ascii=False)

class Tool:
    """Metadatos + función a ejecutar"""
    def __init__(self, name: str, description: str, parameters: dict, func: Callable[[dict], Awaitable[Any]]):
        self.name = name
        self.description = description
        self.parameters = parameters
        self.func = func

    @property
    def schema(self):
        return {
            "type": "function",
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }

class RTMiddleTier:
    def __init__(
        self,
        *, endpoint: str, deployment: str, api_key: str, api_version: str | None = None,
        system_prompt: str | None = None,
        temperature: float | None = None,
        transcribe_deployment: str = "gpt-4o-mini-transcribe",
    ):
        self.endpoint = endpoint.rstrip("/")
        self.deployment = deployment
        self.api_key = api_key
        self.api_version = api_version
        self.system_prompt: str | None = system_prompt
        # Azure exige el NOMBRE DEL DEPLOYMENT (no el del modelo) para la
        # transcripcion de entrada; si no existe, el servicio responde
        # input_audio_transcription.failed con DeploymentNotFound y el usuario
        # nunca ve lo que dijo.
        self.transcribe_deployment = transcribe_deployment
        self.temperature: float | None = temperature
        self.selected_voice: str = "ash"
        self.tools: dict[str, Tool] = {}   
        self._pending_calls: dict[str, str] = {}  # opcional
        # Modalidad pedida por el cliente para la respuesta en curso. Se usa para
        # que la continuacion tras una tool respete el modo (texto o audio) con el
        # que se hizo la pregunta.
        self._pending_modalities: list[str] | None = None
        self._current_modalities: list[str] | None = None

    # ──────────────────────────────────────────────────────────────
    def add_tool(self, tool: Tool):
        self.tools[tool.name] = tool

    # ───────────────────────────────────────────────────────────────────────────
    async def _to_server(self, msg: Any) -> Any:
        """
        Mensajes que van del navegador → OpenAI.
        Aquí enriquecemos 'session.update' con voice, VAD, tools, etc.
        """
        if isinstance(msg, dict):
            if msg.get("type") == "response.create":
                self._pending_modalities = (msg.get("response") or {}).get("output_modalities")

            if msg.get("type") == "session.update":
                session = msg.setdefault("session", {})

                # La API v1 GA (modelos gpt-realtime-*) exige declarar el tipo de sesión.
                session["type"] = "realtime"

                # En v1 GA, voz / transcripción / VAD se anidan bajo session.audio.input
                # y session.audio.output (antes iban sueltos en el nivel superior).
                transcription = {
                    "model": self.transcribe_deployment,
                    "language": "es",
                }
                # Los modelos de diarizacion rechazan 'prompt' (invalid_value).
                if "diarize" not in self.transcribe_deployment:
                    transcription["prompt"] = (
                        "Visitantes en recepción. Puede que el usuario hable en español u otro idioma. "
                        "Por favor, escucha con atención y responde en el mismo idioma."
                    )

                session["audio"] = {
                    "input": {
                        "transcription": transcription,
                        "turn_detection": {
                            "type": "server_vad",
                            "threshold": 0.6,
                            "prefix_padding_ms": 300,
                            "silence_duration_ms": 800
                        }
                    },
                    "output": {
                        "voice": self.selected_voice
                    }
                }

                # 🕒 Hora exacta de Colombia
                current_time = datetime.now(COLOMBIA_TZ).strftime("%H:%M:%S")

                # Instrucciones / system prompt (no borres las que vengan del server en session.created)
                if self.system_prompt is not None:
                    session["instructions"] = (
                        f"{self.system_prompt}\n\n"
                        f"Nota: La hora actual en Colombia es {current_time}."
                    )

                if self.temperature is not None:
                    session["temperature"] = self.temperature

                # 👉 Publica tus tools para que el modelo las pueda invocar
                if self.tools:
                    session["tools"] = [t.schema for t in self.tools.values()]
                    session["tool_choice"] = "auto"  # permite que el modelo llame a tools cuando lo requiera

        return msg

    # ───────────────────────────────────────────────────────────────────────────
    async def _to_client(self, msg: dict, client_ws: web.WebSocketResponse, server_ws: ClientWebSocketResponse):
        """
        Traduce / filtra los eventos que llegan de OpenAI antes
        de enviarlos al navegador. Añade soporte para transcripción,
        tool-calls, speech_started, etc.
        """
        if msg is not None:
            msg_type = msg.get("type")

            match msg_type:
                # No sobrescribas session.* que provengan del servidor:
                case "session.created" | "session.update":
                    # Simplemente reenvía al frontend si lo necesitas para debug/estado
                    await client_ws.send_json(msg)
                    return

                # 'response.audio.delta' (API preview) → 'response.output_audio.delta' (API v1 GA)
                case "response.audio.delta" | "response.output_audio.delta":
                    await client_ws.send_json({
                        "type": "assistant.audio",
                        "audio": msg.get("delta")
                    })
                    return

                # 'response.audio_transcript.*' (preview) → 'response.output_audio_transcript.*' (v1 GA)
                case "response.audio_transcript.delta" | "response.audio_transcript.done" \
                     | "response.output_audio_transcript.delta" | "response.output_audio_transcript.done":
                    await client_ws.send_json({
                        "type": "transcript.delta" if msg_type.endswith("delta") else "transcript.final",
                        "text":  msg["delta"] if msg_type.endswith("delta") else msg["transcript"],
                        "role":  "assistant",
                        "mode":  "audio",
                    })
                    return

                # Respuestas de solo texto (preguntas escritas): el modelo no emite
                # audio_transcript sino output_text. Se traducen al mismo protocolo
                # con mode="text" para que el frontend sepa que no habra audio.
                case "response.text.delta" | "response.text.done" | "response.output_text.delta" | "response.output_text.done":
                    is_delta = msg_type.endswith("delta")
                    await client_ws.send_json({
                        "type": "transcript.delta" if is_delta else "transcript.final",
                        "text":  msg.get("delta", "") if is_delta else msg.get("text", ""),
                        "role":  "assistant",
                        "mode":  "text",
                    })
                    return

                case "conversation.item.input_audio_transcription.completed":
                    # El servidor envía 'transcript' como JSON string con {"text": "..."}
                    try:
                        transcription_json = json.loads(msg["transcript"])
                        text = transcription_json.get("text", "")
                    except Exception:
                        text = msg.get("transcript", "")
                    await client_ws.send_json({
                        "type": "transcript.final",
                        "text":  text,
                        "role":  "user",
                        "mode":  "audio",
                    })
                    return

                case "response.created":
                    self._current_modalities = (
                        (msg.get("response") or {}).get("output_modalities")
                        or self._pending_modalities
                    )
                    self._pending_modalities = None
                    await client_ws.send_json(msg)
                    return

                case "conversation.item.input_audio_transcription.failed":
                    err = msg.get("error", {})
                    print(
                        "Transcripcion de entrada fallida (%s): %s. Revisa que "
                        "OPENAI_TRANSCRIBE_DEPLOYMENT sea un deployment existente."
                        % (err.get("code"), err.get("message"))
                    )
                    await client_ws.send_json(msg)
                    return

                case "input_audio_buffer.speech_started":
                    await client_ws.send_json({"type": "speech_started"})
                    return

                case "conversation.item.created":
                    # Si quisieras trackear function_call -> previous_item_id, puedes usar _pending_calls
                    item = msg.get("item", {})
                    if item.get("type") == "function_call":
                        call = item
                        self._pending_calls[call.get("call_id", "")] = msg.get("previous_item_id", "")
                        # No enviamos nada al frontend aún (hasta que salga output o el modelo continúe)
                        return

                case "response.output_item.done":
                    item = msg.get("item", {})
                    if item.get("type") == "function_call":
                        # Despacho de tool
                        name = item.get("name")
                        try:
                            args = json.loads(item.get("arguments") or "{}")
                        except Exception:
                            args = {}

                        tool = self.tools.get(name)
                        if not tool:
                            out = {"error": f"Unknown tool: {name}"}
                        else:
                            try:
                                out = await tool.func(args)
                            except Exception as e:
                                out = {"error": f"tool '{name}' failed: {str(e)}"}

                        # Entrega la salida de la tool al servidor Realtime
                        await server_ws.send_json({
                            "type": "conversation.item.create",
                            "item": {
                                "type": "function_call_output",
                                "call_id": item["call_id"],
                                "output": _make_str(out),
                            }
                        })

                        # (Opcional) También notifica al frontend si hay una UI especial que renderizar
                        if name == "show_map":
                            await client_ws.send_json({"type": "tool_result", "tool": name, "data": out})

                        # Pide al modelo que continúe después de la tool, en la misma
                        # modalidad de la pregunta (si se preguntó por escrito, la
                        # respuesta tras la búsqueda tampoco debe locutarse).
                        cont: dict[str, Any] = {"type": "response.create"}
                        if self._current_modalities:
                            cont["response"] = {"output_modalities": self._current_modalities}
                        await server_ws.send_json(cont)
                        return

                case "error":
                    # Reenvía y loggea
                    print("❌ Realtime error:", msg)
                    await client_ws.send_json(msg)
                    return

            # Por defecto, reenvía cualquier otro evento al frontend
            await client_ws.send_json(msg)

    # ───────────────────────────────────────────────────────────────────────────
    async def forward_messages(self, client_ws: web.WebSocketResponse):
        """
        Crea dos corutinas:
          1)  lee del cliente → envía a OpenAI
          2)  lee de OpenAI → envía al cliente
        Ambas se ejecutan en paralelo con asyncio.gather / asyncio.wait.
        """
        headers = {"api-key": self.api_key}

        if self.api_version:
            # API GA clásica: /openai/realtime?api-version=...&deployment=...
            ws_path = "/openai/realtime"
            params = {
                "api-version": self.api_version,
                "deployment":  self.deployment,
            }
        else:
            # Nueva API v1 (modelos como gpt-realtime-*): /openai/v1/realtime?model=...
            # No usa api-version; el deployment se pasa como 'model'.
            ws_path = "/openai/v1/realtime"
            params = {"model": self.deployment}

        async with aiohttp.ClientSession(base_url=self.endpoint) as sess:
            async with sess.ws_connect(ws_path, params=params, headers=headers) as openai_ws:

                # ── cliente → servidor ──
                async def client_to_openai():
                    try:
                        async for raw in client_ws.iter_text():
                            try:
                                msg = await self._to_server(json.loads(raw))
                                await openai_ws.send_str(json.dumps(msg))
                            except json.JSONDecodeError as e:
                                print("❌ Error de decodificación JSON desde cliente:", e)
                            except Exception:
                                # traceback completo: un error aquí silenciosamente descarta
                                # el mensaje (p. ej. session.update con instructions/tools)
                                # sin que llegue nunca a OpenAI.
                                traceback.print_exc()
                    except Exception as e:
                        print("❌ Error en la conexión cliente → servidor:", e)

                # ── servidor → cliente ──
                async def openai_to_client():
                    try:
                        async for msg in openai_ws:
                            try:
                                if msg.type == aiohttp.WSMsgType.TEXT:
                                    await self._to_client(json.loads(msg.data), client_ws, openai_ws)
                                elif msg.type == aiohttp.WSMsgType.BINARY:
                                    # Si en algún momento manejas binario (p.ej. audio PCM directo),
                                    # aquí podrías reenviarlo al frontend según tu protocolo.
                                    print("ℹ️ Mensaje binario recibido de OpenAI (omitido).")
                                elif msg.type == aiohttp.WSMsgType.ERROR:
                                    print("❌ WS error desde OpenAI:", msg.data)
                                else:
                                    print("❗ Tipo de mensaje WebSocket inesperado:", msg.type)
                            except json.JSONDecodeError as e:
                                print("❌ Error decodificando JSON de OpenAI:", e)
                            except Exception:
                                traceback.print_exc()
                    except Exception as e:
                        print("❌ Error en la conexión servidor → cliente:", e)

                client_task = asyncio.create_task(client_to_openai())
                server_task = asyncio.create_task(openai_to_client())

                done, pending = await asyncio.wait(
                    {client_task, server_task},
                    return_when=asyncio.FIRST_EXCEPTION,
                )

                # Cancela la que quede pendiente (sea client o server)
                for task in pending:
                    task.cancel()
                    try:
                        await task
                    except Exception:
                        pass

                # Cierra la conexión a OpenAI si aún no se ha cerrado
                if not openai_ws.closed:
                    await openai_ws.close()