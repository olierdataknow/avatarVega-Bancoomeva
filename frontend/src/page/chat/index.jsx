import { useEffect, useRef, useState } from "react";
import { SecondaryButton } from "../../components/common/Button";
import { CustomTextField } from "../../components/common/Input";
// import { FormControl, MenuItem, Select } from "@mui/material";
import UseChat from "../../hooks/Chat";

// const assistants = ["Nova", "Lyra", "Zena"];

export default function Chat() {
  const {
    connectAvatar,
    isLoadingActiveAvatar,
    sessionActive,
    activeMicrophone,
    messages,
    msg,
    setMsg,
    handleUserQuery,
    disabledMsg,
    isHear,
    disconnectAvatar,
    isMicrophone,
    avatarSynthesizer,
  } = UseChat();

  // const [assistant, setAssistant] = useState("Nova");
  const [isChat, setIsChat] = useState(false);
  const [isCopy, setIsCopy] = useState(false);

  const chatContainerRef = useRef(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  function handleCopy() {
    const textToCopy = messages
      .map(
        (msg) =>
          `${msg.role === "user" ? "Usuario" : "Asistente"}: ${msg.content}`
      )
      .join("\n");

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        setIsCopy(true);
        setTimeout(() => {
          setIsCopy(false);
        }, 2000);
      })
      .catch((err) => console.error("Error al copiar:", err));
  }
  
  return (
    <div className="w-full h-screen p-6 bg-[#f7faf7]">
      <div className="flex flex-row space-x-6 relative h-full w-full">
        {/* 🔹 Sección meet */}
        <div className="w-full lg:w-8/12 h-full space-y-4">
            <img
              src="/logo.svg"
              alt="Logo"
              className="object-contain h-1/12"
            />
          <div className="rounded-lg h-9/12 overflow-hidden relative">
            {/* <FormControl
              className="!absolute top-4 left-4"
              sx={{
                "& .MuiInputBase-input": {
                  background: "",
                },
                "& .MuiOutlinedInput-root": {
                  "&.Mui-focused fieldset": {
                    borderColor: "#9EC747",
                  },
                  "&:hover fieldset": {
                    borderColor: "#9EC747",
                  },
                },
              }}
            >
              <Select
                value={assistant}
                onChange={(e) => setAssistant(e.target.value)}
              >
                {assistants.map((name) => (
                  <MenuItem key={name} value={name}>
                    {name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl> */}
            <div className="h-full lg:h-fit">
              <img
                id="localVideo"
                src="/img_avatar_one.png"
                alt="Avatar"
                className="w-full h-full object-cover lg:object-contain rounded-lg"
              />
              <div id="remoteVideo"></div>
            </div>
          </div>
          <div className="h-auto w-full flex justify-center gap-2">
            <div className="flex-1 flex flex-row gap-2 justify-center">
              <SecondaryButton
                className="disabled:opacity-50 disabled:!cursor-not-allowed"
                disabled={isMicrophone}
                sx={{
                  padding: "16px",
                  borderRadius: "8px",
                  ...(!isHear
                    ? {
                        background: "red",
                        fill: "white",
                        "&:hover": {
                          backgroundColor: "red",
                        },
                      }
                    : {}),
                }}
                onClick={() => (isHear ? null : activeMicrophone())}
              >
                <box-icon
                  {...(isHear
                    ? {
                        name: "microphone",
                        type: "solid",
                      }
                    : {
                        name: "microphone-off",
                        type: "solid",
                      })}
                  size="lg"
                ></box-icon>
              </SecondaryButton>
              <SecondaryButton
                className={`p-2 xl:p-4 disabled:opacity-50 ${
                  isLoadingActiveAvatar && "animated-border-button"
                }`}
                sx={{ borderRadius: "8px" }}
                disabled={isLoadingActiveAvatar}
                onClick={() => {
                  if (avatarSynthesizer) {
                    disconnectAvatar();
                  } else {
                    connectAvatar();
                  }
                }}
              >
                <box-icon
                  name={sessionActive ? "stop" : "play"}
                  size="lg"
                ></box-icon>
                {isLoadingActiveAvatar && (
                  <svg>
                    <rect x="0" y="0" fill="none" width="100%" height="100%" />
                  </svg>
                )}
              </SecondaryButton>

              {/* <SecondaryButton
                className="p-2 xl:p-4 disabled:opacity-50"
                sx={{ borderRadius: "8px" }}
                onClick={() => stopSpeaking()}
                disabled={!isSpeaking}
              >
                <box-icon name="volume-mute" type="solid" size="lg"></box-icon>
              </SecondaryButton> */}
            </div>
            <div className="flex lg:hidden">
              <SecondaryButton
                sx={{
                  padding: "16px",
                  border: "none",
                  background: "transparent",
                  borderRadius: "100px",
                }}
                onClick={() => setIsChat(!isChat)}
              >
                <box-icon name="conversation" type="solid" size="lg"></box-icon>
              </SecondaryButton>
            </div>
          </div>
        </div>

        {/* 🔹 Sección del Chat */}
        <div
          className={`absolute top-0 right-0 h-10/12 lg:h-full my-2 w-10/12 lg:relative lg:w-4/12 flex flex-col bg-white rounded-lg shadow p-4 transition-all duration-300 ease-in-out transform
    ${
      isChat
        ? "opacity-100 scale-100"
        : "opacity-0 scale-95 pointer-events-none"
    } 
    lg:opacity-100 lg:scale-100 lg:pointer-events-auto lg:flex`}
        >
          <div className="flex justify-between items-center">
            <h3 className="text-2xl font-bold">Chat</h3>
            <button
              className={`p-1 rounded-md transition-all duration-300 ease-in-out hover:bg-gray-100 h-fit w-fit fill-[#3b3a3a] ${
                isCopy ? "cursor-default" : "cursor-pointer"
              }  disabled:opacity-50`}
              onClick={() => (isCopy ? null : handleCopy())}
            >
              <div className="transition-transform duration-300 ease-in-out">
                {isCopy ? (
                  <box-icon name="check"></box-icon>
                ) : (
                  <box-icon name="copy"></box-icon>
                )}
              </div>
            </button>
          </div>
          <div
            ref={chatContainerRef}
            className="flex-grow min-h-0 overflow-y-auto space-y-2 my-2 px-2"
          >
            {messages.length ? (
              messages.map((msg, index) => (
                <div key={index}>
                  {msg.role === "user" && (
                    <div className="w-full px-4 py-3 bg-[#A5C94D] rounded-tl-xl rounded-tr-xl rounded-bl-xl typewriter">
                      <span>{msg.content}</span>
                    </div>
                  )}
                  {msg.role === "assistant" && (
                    <div className="flex gap-2 items-end">
                      <img
                        src="/img_avatar_one.png"
                        alt="Avatar"
                        className="w-[40px] h-[40px] rounded-full object-cover"
                        style={{ imageRendering: "auto" }}
                      />
                      <div>
                        <p className="text-neutral-500 text-xs">Asistente</p>
                        <div className="w-full px-4 py-3 bg-[#A5C94D66] rounded-tl-xl rounded-tr-xl rounded-br-xl text-black typewriter">
                          <Typewriter text={msg.content} delay={10} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <></>
            )}
            {disabledMsg && (
              <div className="flex gap-2 items-end">
                <img
                  src="/img_avatar_one.png"
                  alt="Avatar"
                  className="w-[40px] h-[40px] rounded-full object-cover"
                  style={{ imageRendering: "auto" }}
                />
                <div>
                  <p className="text-neutral-500 text-xs">Asistente</p>
                  <div className="w-full px-4 py-1 bg-[#A5C94D66] rounded-tl-xl rounded-tr-xl rounded-br-xl text-black typewriter flex flex-row gap-1">
                    <p
                      className="animate-bounce text-2xl font-bold h-fit"
                      style={{ animationDelay: "0.2s" }}
                    >
                      .
                    </p>
                    <p
                      className="animate-bounce text-2xl font-bold h-fit"
                      style={{ animationDelay: "0.4s" }}
                    >
                      .
                    </p>
                    <p
                      className="animate-bounce text-2xl font-bold h-fit"
                      style={{ animationDelay: "0.6s" }}
                    >
                      .
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          <form
            className="flex items-center bg-[#e6e6e6] rounded-2xl p-2"
            onSubmit={(e) => {
              e.preventDefault();
              console.log("msg:", msg, "disabledMsg:", disabledMsg);
              if (msg.length > 0 && !disabledMsg) {
                handleUserQuery(msg, "", "");
              }
            }}
          >
            <CustomTextField
              onChange={(e) => {
                console.log("Nuevo valor de msg:", e.target.value);
                setMsg(e.target.value);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  console.log("entr");
                  e.preventDefault();
                  e.target.form.requestSubmit();
                }
              }}
              value={msg}
              className="w-full"
              placeholder="Escribe tu mensaje"
              sx={{
                border: "none",
                outline: "none",
                "& fieldset": { border: "none" },
                "&:focus": { outline: "none" },
                "&:hover fieldset": { border: "none" },
              }}
            />
            <button
              type="submit"
              className="px-2 disabled:opacity-50"
              disabled={disabledMsg || msg.length === 0}
              onClick={() => console.log("Botón clickeado")}
            >
              <box-icon name="send"></box-icon>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

const Typewriter = ({ text, delay }) => {
  const [currentText, setCurrentText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (currentIndex < text.length) {
      const timeout = setTimeout(() => {
        setCurrentText((prevText) => prevText + text[currentIndex]);
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [currentIndex, delay, text]);

  return <span>{currentText}</span>;
};
