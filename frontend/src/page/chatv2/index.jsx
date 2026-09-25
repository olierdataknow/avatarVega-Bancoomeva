import { useEffect, useRef, useState } from "react";
import { useVoiceAssistant } from "./hooks/useVoice";
import CaptionsCC from "../../components/common/CaptionCC";

export default function ChatV2() {
  const [msg, setMsg] = useState([]);
  const [showCaptions, setShowCaptions] = useState(true);
  const [draft, setDraft] = useState("");
  const chatContainerRef = useRef(null);

  const {
    disconnect,
    startMic,
    stopMic,
    sendText,
    status,
    isConnected,
    micOn,
    setAnalyzerData,
  } = useVoiceAssistant({ setMsg });

  const lastMsg = msg.length ? msg[msg.length - 1] : null;
  // Lo hablado va a los subtítulos; lo escrito, a la caja de conversación.
  const spokenMsg = lastMsg?.mode === "text" ? null : lastMsg;

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [msg]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    sendText(text);
  };

  return (
    <div className="bg-[#efefef] flex flex-row justify-center items-center h-screen w-full p-5 gap-4">
      {/* ── Agente conversacional ── */}
      <div className="flex flex-col flex-1 h-full">
        <div className="flex-1 flex flex-col justify-center items-center relative w-full">
          <div className="flex-1 flex justify-center transition-opacity duration-700 border border-input bg-muted rounded-2xl shadow relative">
            <img
              src="/logo_completo.png"
              alt="Logo Bancoomeva"
              className="absolute top-2 left-2 z-10"
              width={150}
            />

            {/* No esta hablando */}
            <img
              src="/avatar/vega-2 (1).png"
              className={`w-[80vh] object-contain ${
                status == "Hablando"
                  ? "opacity-100"
                  : "opacity-0 -z-10  absolute pointer-events-none"
              }`}
              alt="avatar"
            />
            <img
              src="/avatar/vega 3 (1).png"
              className={`w-[80vh] object-contain ${
                status == "Hablando"
                  ? "opacity-0 -z-10 absolute pointer-events-none"
                  : "opacity-100"
              }`}
              alt="avatar"
            />

            {/* Subtítulos de lo que se habla */}
            {showCaptions && (
              <CaptionsCC message={isConnected ? spokenMsg : null} />
            )}
          </div>
        </div>

        {/* Controles de voz */}
        <div className="flex justify-center items-center gap-4 pt-2">
          <button
            className={`cursor-pointer rounded border px-2 py-0.5 text-xs font-bold transition-colors ${
              showCaptions
                ? "border-neutral-600 bg-neutral-600 text-white"
                : "border-neutral-400 text-neutral-500"
            }`}
            onClick={() => setShowCaptions((prev) => !prev)}
            title={showCaptions ? "Ocultar subtítulos" : "Mostrar subtítulos"}
          >
            CC
          </button>

          <button
            className={`relative my-ellipse cursor-pointer hover:opacity-50 fill-neutral-600  ${
              status === "Conectando" ? "waves" : ""
            }`}
            onClick={() => {
              if (micOn) {
                stopMic();
                setAnalyzerData(null);
              } else {
                startMic();
              }
            }}
            disabled={status === "Conectando"}
            title={micOn ? "Apagar micrófono" : "Hablar"}
          >
            {!micOn && (
              <div className="w-[3px] bg-neutral-600 h-[40px] absolute z-10 -rotate-45"></div>
            )}
            <svg
              width="40"
              height="40"
              viewBox="0 0 60 60"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M20.625 11.25C20.625 8.7636 21.6127 6.37903 23.3709 4.62087C25.129 2.86272 27.5136 1.875 30 1.875C32.4864 1.875 34.871 2.86272 36.6291 4.62087C38.3873 6.37903 39.375 8.7636 39.375 11.25V31.875C39.375 34.3614 38.3873 36.746 36.6291 38.5041C34.871 40.2623 32.4864 41.25 30 41.25C27.5136 41.25 25.129 40.2623 23.3709 38.5041C21.6127 36.746 20.625 34.3614 20.625 31.875V11.25Z" />
              <path d="M15 26.25C15.4973 26.25 15.9742 26.4475 16.3258 26.7992C16.6775 27.1508 16.875 27.6277 16.875 28.125V31.875C16.875 35.356 18.2578 38.6944 20.7192 41.1558C23.1806 43.6172 26.519 45 30 45C33.481 45 36.8194 43.6172 39.2808 41.1558C41.7422 38.6944 43.125 35.356 43.125 31.875V28.125C43.125 27.6277 43.3225 27.1508 43.6742 26.7992C44.0258 26.4475 44.5027 26.25 45 26.25C45.4973 26.25 45.9742 26.4475 46.3258 26.7992C46.6775 27.1508 46.875 27.6277 46.875 28.125V31.875C46.8749 36.0261 45.3451 40.0315 42.5779 43.1257C39.8107 46.2199 36.0003 48.1857 31.875 48.6475V54.375H39.375C39.8723 54.375 40.3492 54.5725 40.7008 54.9242C41.0525 55.2758 41.25 55.7527 41.25 56.25C41.25 56.7473 41.0525 57.2242 40.7008 57.5758C40.3492 57.9275 39.8723 58.125 39.375 58.125H20.625C20.1277 58.125 19.6508 57.9275 19.2992 57.5758C18.9475 57.2242 18.75 56.7473 18.75 56.25C18.75 55.7527 18.9475 55.2758 19.2992 54.9242C19.6508 54.5725 20.1277 54.375 20.625 54.375H28.125V48.6475C23.9997 48.1857 20.1893 46.2199 17.4221 43.1257C14.6549 40.0315 13.1251 36.0261 13.125 31.875V28.125C13.125 27.6277 13.3225 27.1508 13.6742 26.7992C14.0258 26.4475 14.5027 26.25 15 26.25Z" />
            </svg>{" "}
          </button>

          <span className="w-24 text-sm text-neutral-500">
            {status === "idle" ? "" : status}
          </span>
        </div>
      </div>

      {/* ── Caja de conversación escrita ── */}
      <div className="flex flex-col gap-3 h-full w-4/12 bg-white p-4 rounded-xl">
        <div className="flex items-center justify-between">
          <h1 className="font-bold text-xl">Conversación</h1>
          {isConnected && (
            <button
              className="cursor-pointer text-sm text-neutral-500 underline hover:text-neutral-700"
              onClick={() => {
                disconnect();
                setAnalyzerData(null);
              }}
            >
              Terminar
            </button>
          )}
        </div>

        <div
          className="flex-1 flex flex-col gap-3 overflow-y-auto pr-1"
          ref={chatContainerRef}
        >
          {msg.length === 0 && (
            <p className="text-sm text-neutral-400">
              Escribe tu consulta o pulsa el micrófono para hablar con el
              asistente.
            </p>
          )}

          {msg.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "assistant"
                  ? "self-start bg-neutral-200 text-neutral-900"
                  : "self-end border border-neutral-300 bg-white text-neutral-700"
              }`}
            >
              {m.value}
            </div>
          ))}

          {status === "Pensando" && (
            <span className="self-start text-sm text-neutral-400">
              Escribiendo...
            </span>
          )}
        </div>

        {/* Consultas por escrito: no requieren micrófono */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Escribe tu consulta..."
            className="flex-1 min-w-0 rounded-full border border-neutral-300 px-4 py-2 outline-none focus:border-neutral-500"
            disabled={status === "Conectando"}
          />
          <button
            type="submit"
            className="cursor-pointer rounded-full bg-neutral-600 px-4 py-2 text-white transition-opacity hover:opacity-70 disabled:opacity-40"
            disabled={!draft.trim() || status === "Conectando"}
          >
            Enviar
          </button>
        </form>
      </div>
    </div>
  );
}
