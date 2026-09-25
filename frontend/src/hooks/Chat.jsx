import { useEffect, useRef, useState } from "react";
import CONFIG from "../../config.json";
import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { htmlEncode } from "../../utils";

function UseChat() {
  const [dataSources, setDataSources] = useState([]);
  const [preguntas, setPreguntas] = useState("");
  const [messageInitiated, setMessageInitiated] = useState(false);
  const [messages, setMessages] = useState([]);
  const [sessionActive, setSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [avatarSynthesizer, setAvatarSynthesizer] = useState(null);
  const [speechRecognizer, setSpeechRecognizer] = useState();
  const [isHear, setIsHear] = useState(false);
  const [isLoadingActiveAvatar, setIsLoadingActiveAvatar] = useState(false);
  const [msg, setMsg] = useState("");
  const [disabledMsg, setDisabledMsg] = useState(false);
  const [isMicrophone, setIsMicrophone] = useState(true);

  const latestMessagesRef = useRef(messages);
  const isFluentConversation = useRef(false);

  useEffect(() => {
    latestMessagesRef.current = messages;
  }, [messages]);

  // Initialize messages
  function initMessages() {
    if (dataSources.length === 0) {
      let systemPrompt =
        CONFIG.systemPrompt + ".La información del evento es " + preguntas;
      let systemMessage = {
        role: "system",
        content: systemPrompt,
      };
      setMessages((prev) => {
        console.log(prev);
        return [...prev, systemMessage];
      });
    }
  }

  // Set data sources for chat API
  function handleDataSources(
    azureCogSearchEndpoint,
    azureCogSearchApiKey,
    azureCogSearchIndexName
  ) {
    let dataSource = {
      type: "AzureCognitiveSearch",
      parameters: {
        endpoint: azureCogSearchEndpoint,
        key: azureCogSearchApiKey,
        indexName: azureCogSearchIndexName,
        semanticConfiguration: "",
        queryType: "simple",
        fieldsMapping: {
          contentFieldsSeparator: "\n",
          contentFields: ["content"],
          filepathField: null,
          titleField: "title",
          urlField: null,
        },
        inScope: true,
        roleInformation:
          CONFIG.systemPrompt + ".La información del evento es " + preguntas,
      },
    };

    setDataSources([dataSource]);
  }

  // Setup WebRTC
  function setupWebRTC(
    iceServerUrl,
    iceServerUsername,
    iceServerCredential,
    avatarSynth
  ) {
    // Create WebRTC peer connection
    let peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: [iceServerUrl],
          username: iceServerUsername,
          credential: iceServerCredential,
        },
      ],
    });

    // Fetch WebRTC video stream and mount it to an HTML video element
    peerConnection.ontrack = function (event) {
      if (event.track.kind === "audio") {
        let audioElement = document.createElement("audio");
        audioElement.id = "audioPlayer";
        audioElement.srcObject = event.streams[0];
        audioElement.autoplay = true;

        audioElement.onplaying = () => {
          console.log(`WebRTC ${event.track.kind} channel connected.`);
        };

        document.getElementById("remoteVideo").appendChild(audioElement);
      }

      if (event.track.kind === "video") {
        let videoElement = document.createElement("video");
        videoElement.id = "videoPlayer";
        videoElement.srcObject = event.streams[0];
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        let remoteVideoDiv = document.getElementById("remoteVideo");

        videoElement.onplaying = () => {
          // Clean up existing video element if there is any
          for (var i = 0; i < remoteVideoDiv.childNodes.length; i++) {
            if (remoteVideoDiv.childNodes[i].localName === event.track.kind) {
              remoteVideoDiv.removeChild(remoteVideoDiv.childNodes[i]);
            }
          }
          document.getElementById("localVideo").hidden = true;

          // Append the new video element
          document.getElementById("remoteVideo").appendChild(videoElement);

          document.getElementById("remoteVideo").style.width = "100%";
          document.getElementById("remoteVideo").style.height = "100%";
          document.getElementById("remoteVideo").style.backgroundSize = "cover"; // Optional: to cover the entire element
        };
      }
    };

    // Listen to data channel, to get the event from the server
    peerConnection.addEventListener("datachannel", (event) => {
      const dataChannel = event.channel;
      dataChannel.onmessage = () => {};
    });

    // This is a workaround to make sure the data channel listening is working by creating a data channel from the client side
    peerConnection.createDataChannel("eventChannel");

    // Make necessary update to the web page when the connection state changes
    peerConnection.oniceconnectionstatechange = () => {};

    // Offer to receive 1 audio, and 1 video track
    peerConnection.addTransceiver("video", { direction: "sendrecv" });
    peerConnection.addTransceiver("audio", { direction: "sendrecv" });

    // start avatar, establish WebRTC connection
    avatarSynth
      .startAvatarAsync(peerConnection)
      .then((r) => {
        if (r.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
          console.log(
            "[" +
              new Date().toISOString() +
              "] Avatar started. Result ID: " +
              r.resultId
          );
        } else {
          console.log(
            "[" +
              new Date().toISOString() +
              "] Unable to start avatar. Result ID: " +
              r.resultId
          );
          if (r.reason === SpeechSDK.ResultReason.Canceled) {
            let cancellationDetails =
              SpeechSDK.CancellationDetails.fromResult(r);
            if (
              cancellationDetails.reason === SpeechSDK.CancellationReason.Error
            ) {
              console.log(cancellationDetails.errorDetails);
            }

            console.log(
              "Unable to start avatar: " + cancellationDetails.errorDetails
            );
          }
          //   document.getElementById("startSession").disabled = false;
          // document.getElementById('configuration').hidden = false;
        }
      })
      .catch((error) => {
        console.error(
          "[" +
            new Date().toISOString() +
            "] Avatar failed to start. Error: " +
            error
        );
        // document.getElementById("startSession").disabled = false;
        // document.getElementById('configuration').hidden = false
      })
      .finally(() => {
        setSessionActive(true);
        console.log("cambiar isMicrophone");
        setIsMicrophone(false);
        isFluentConversation.current = true;
        setIsLoadingActiveAvatar(false);
      });
  }

  // Connect to avatar service
  // Connect to avatar service
  const connectAvatar = () => {
    // Establece el estado a "cargando" antes de comenzar la conexión
    setIsLoadingActiveAvatar(true);
    const cogSvcRegion = "southcentralus";
    const cogSvcSubKey = CONFIG.cogSvcSubKey;
    const privateEndpointEnabled = false;
    let speechSynthesisConfig;
    let avatarSynth;

    try {
      speechSynthesisConfig = SpeechSDK.SpeechConfig.fromSubscription(
        cogSvcSubKey,
        cogSvcRegion
      );

      speechSynthesisConfig.endpointId = document.getElementById(
        "customVoiceEndpointId"
      )?.value;

      const avatarConfig = new SpeechSDK.AvatarConfig(
        CONFIG.talkingAvatarCharacter,
        CONFIG.talkingAvatarStyle
      );
      avatarConfig.customized = false;
      avatarSynth = new SpeechSDK.AvatarSynthesizer(
        speechSynthesisConfig,
        avatarConfig
      );

      avatarSynth.avatarEventReceived = (s, e) => {
        const offsetMessage = e.offset
          ? `, offset from session start: ${e.offset / 10000}ms.`
          : "";
        console.log(`Event received: ${e.description}${offsetMessage}`);
      };

      const speechRecognitionConfig = SpeechSDK.SpeechConfig.fromEndpoint(
        new URL(
          `wss://${cogSvcRegion}.stt.speech.microsoft.com/speech/universal/v2`
        ),
        cogSvcSubKey
      );

      speechRecognitionConfig.setProperty(
        SpeechSDK.PropertyId.SpeechServiceConnection_LanguageIdMode,
        "Continuous"
      );

      const sttLocales = CONFIG.sttlocales.split(",");
      const autoDetectSourceLanguageConfig =
        SpeechSDK.AutoDetectSourceLanguageConfig.fromLanguages(sttLocales);

      let speechRecognizer = SpeechSDK.SpeechRecognizer.FromConfig(
        speechRecognitionConfig,
        autoDetectSourceLanguageConfig,
        SpeechSDK.AudioConfig.fromDefaultMicrophoneInput()
      );

      setSpeechRecognizer(speechRecognizer);

      if (CONFIG.is_own_data) {
        const {
          azureCogSearchEndpoint,
          azureCogSearchApiKey,
          azureCogSearchIndexName,
        } = CONFIG;
        if (
          !azureCogSearchEndpoint ||
          !azureCogSearchApiKey ||
          !azureCogSearchIndexName
        ) {
          alert(
            "Please fill in the Azure Cognitive Search endpoint, API key, and index name."
          );
          return;
        } else {
          handleDataSources(
            azureCogSearchEndpoint,
            azureCogSearchApiKey,
            azureCogSearchIndexName
          );
        }
      }

      if (!messageInitiated) {
        initMessages();
        setMessageInitiated(true);
      }

      const xhr = new XMLHttpRequest();
      const endpoint = privateEndpointEnabled
        ? `https://${CONFIG.privateEndpoint}/tts/cognitiveservices/avatar/relay/token/v1`
        : `https://${cogSvcRegion}.tts.speech.microsoft.com/cognitiveservices/avatar/relay/token/v1`;

      xhr.open("GET", endpoint);
      xhr.setRequestHeader("Ocp-Apim-Subscription-Key", cogSvcSubKey);
      xhr.addEventListener("readystatechange", function () {
        if (this.readyState === 4) {
          const responseData = JSON.parse(this.responseText);
          const { Urls, Username, Password } = responseData;
          setupWebRTC(Urls[0], Username, Password, avatarSynth);
        }
      });
      xhr.send();
      setAvatarSynthesizer(avatarSynth);
    } catch (error) {
      console.error("Error al conectar al servicio de avatar:", error);
      // En caso de error, desactiva el estado de carga
      setIsLoadingActiveAvatar(false);
    }
  };

  // Disconnect from avatar service
  async function disconnectAvatar() {
    try {
      if (avatarSynthesizer) {
        await avatarSynthesizer.stopSpeakingAsync();
      }
      if (speechRecognizer) {
        await speechRecognizer?.stopContinuousRecognitionAsync();
        await speechRecognizer?.close();
      }
    } catch (error) {
      console.error("Error al detener el avatar:", error);
    } finally {
      setTimeout(() => {
        console.log("disconnect isMicrophone");
        console.log("disconnect");
        setIsMicrophone(true);
        setIsLoadingActiveAvatar(false);
        isFluentConversation.current = false;
        setSpeechRecognizer(null); // Si es para limpiar, es mejor pasar null
        setIsHear(false);
        setSessionActive(false);
        setAvatarSynthesizer(null); // Igual, esto aclara que se limpió
      }, 500);
    }
  }

  async function fetchpreguntasTxt() {
    return fetch("/preguntas.txt")
      .then((response) => response.text()) // Convertir la respuesta a texto
      .then((data) => {
        setPreguntas(data); // Almacenar los datos de texto en una variable
      })
      .catch((error) => {
        console.error("Error al leer el archivo TXT:", error);
        throw error; // Re-lanzar el error para manejarlo en la llamada de la función
      });
  }

  const speakNext = (text, endingSilenceMs = 0) => {
    if (!text || !avatarSynthesizer) {
      return;
    }

    text = text.replace(/\*/g, "");
    const ttsVoice = CONFIG.ttsVoice;
    const personalVoiceSpeakerProfileID =
      document.getElementById("personalVoiceSpeakerProfileID")?.value || "";

    let ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'>
      <voice name='${ttsVoice}'>
        <mstts:ttsembedding speakerProfileId='${personalVoiceSpeakerProfileID}'>
          <mstts:leadingsilence-exact value='0'/>
          ${htmlEncode(text)}
        </mstts:ttsembedding>
      </voice>
    </speak>`;

    if (endingSilenceMs > 0) {
      ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='http://www.w3.org/2001/mstts' xml:lang='en-US'>
        <voice name='${ttsVoice}'>
          <mstts:ttsembedding speakerProfileId='${personalVoiceSpeakerProfileID}'>
            <mstts:leadingsilence-exact value='0'/>
            ${htmlEncode(text)}
            <break time='${endingSilenceMs}ms' />
          </mstts:ttsembedding>
        </voice>
      </speak>`;
    }
    setIsSpeaking(true);
    setIsMicrophone(true);
    avatarSynthesizer
      .speakSsmlAsync(ssml)
      .then(() => {
        // Termina de hablar
        console.log("cambiar isMicrophone");
        setIsMicrophone(false);
        setIsSpeaking(false);
        isFluentConversation.current && activeMicrophone();
      })
      .catch((error) => {
        console.error(`Speech synthesis error: ${error}`);
        console.log("cambiar isMicrophone");
        setIsMicrophone(false);
        setIsSpeaking(false);
      });
  };

  function stopSpeaking() {
    avatarSynthesizer
      ?.stopSpeakingAsync()
      .then(() => {
        console.log("Stop Speaking");
        setIsMicrophone(true);
        setIsSpeaking(false);
        setIsHear(false);
      })
      .catch((error) => {
        console.log("Error occurred while stopping speaking: " + error);
      });
  }

  const handleUserQuery = async (userQuery, userQueryHTML, imgUrlPath) => {
    setDisabledMsg(true);
    setMsg("");
    let contentMessage = imgUrlPath.trim()
      ? [
          { type: "text", text: userQuery },
          { type: "image_url", image_url: { url: imgUrlPath } },
        ]
      : userQuery;

    let chatMessage = { role: "user", content: contentMessage };

    let msgs = [...latestMessagesRef.current, chatMessage];

    setMessages(msgs);

    if (isSpeaking) {
      stopSpeaking();
    }

    try {
      const response = await fetchChatAPI(msgs);
      console.log({ response });
      processResponse(response);
    } catch (error) {
      console.error("Error en la API:", error);
      setDisabledMsg(false);
      console.log("cambiar isMicrophone");
      setIsMicrophone(false);
    }
  };

  const fetchChatAPI = async (msgs) => {
    const {
      azureOpenAIEndpoint,
      azureOpenAIApiKey,
      azureOpenAIDeploymentName,
    } = CONFIG;

    let url = `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/chat/completions?api-version=2023-06-01-preview`;
    let body = JSON.stringify({ messages: msgs, stream: true });

    if (dataSources.length > 0) {
      url = `${azureOpenAIEndpoint}/openai/deployments/${azureOpenAIDeploymentName}/extensions/chat/completions?api-version=2023-06-01-preview`;
      body = JSON.stringify({ dataSources, messages: msgs, stream: true });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": azureOpenAIApiKey,
        "Content-Type": "application/json",
      },
      body,
    });

    if (!response.ok) {
      throw new Error(
        `Chat API Error: ${response.status} ${response.statusText}`
      );
    }

    return response.body.getReader();
  };

  const processResponse = async (reader) => {
    let assistantReply = "";
    let toolContent = "";
    let spokenSentence = "";
    let displaySentence = "";

    const read = async (previousChunkString = "") => {
      const { value, done } = await reader.read();
      if (done) {
        return;
      }

      let chunkString = new TextDecoder().decode(value, { stream: true });
      if (previousChunkString !== "") {
        chunkString = previousChunkString + chunkString;
      }

      if (!chunkString.endsWith("}\n\n") && !chunkString.includes("[DONE]")) {
        return read(chunkString);
      }

      chunkString
        .split("\n\n")
        .map((line) => line.trim()) // Eliminar espacios extra
        .forEach((line) => {
          try {
            if (line.startsWith("data:")) {
              const trimmedLine = line.substring(5).trim();

              // 🚨 Filtrar explícitamente "[DONE]" en cualquier parte
              if (trimmedLine.includes("[DONE]")) return;

              const responseJson = JSON.parse(trimmedLine);
              let responseToken;
              let role = "assistant";

              if (dataSources.length === 0) {
                responseToken = responseJson.choices[0].delta.content;
              } else {
                role = responseJson.choices[0].messages[0].delta.role;
                responseToken =
                  responseJson.choices[0].messages[0].delta.content;
              }

              if (role === "tool") {
                toolContent += responseToken || "";
              } else if (responseToken) {
                assistantReply += responseToken;
                displaySentence += responseToken.replace(/\n/g, "");
                spokenSentence += responseToken.replace(/\n/g, "");

                if ([".", "!", "?"].includes(responseToken.trim())) {
                  // avatarSynthesizer && speak(spokenSentence.trim());
                  spokenSentence = "";
                }
              }
            }
          } catch (error) {
            console.error("Error procesando respuesta:", error);
          }
        });

      // 🔹 Filtrar "[DONE]" antes de actualizar la UI
      assistantReply = assistantReply.replace("[DONE]", "").trim();
      displaySentence = displaySentence.replace("[DONE]", "").trim();
      displaySentence = "";

      return read();
    };

    await read();
    await read();

    try {
      if (assistantReply) {
        if (spokenSentence !== "") {
          speakNext(spokenSentence.trim());
        } else if (assistantReply !== "") {
          speakNext(assistantReply.trim());
        }
      }
    } catch (error) {
      console.log(error);
    }

    setMessages((prev) => {
      let updatedMessages = [...prev];

      // 🔹 Filtrar toolContent antes de agregarlo
      if (toolContent) {
        try {
          const toolData = JSON.parse(toolContent);
          if (toolData && toolData.content) {
            updatedMessages.push({ role: "tool", content: toolData.content });
          }
        } catch (e) {
          console.warn("No se pudo parsear toolContent:", { toolContent, e });
        }
      }
      updatedMessages.push({ role: "assistant", content: assistantReply });
      return updatedMessages;
    });
    setDisabledMsg(false);

    if (toolContent) {
      try {
        const toolData = JSON.parse(toolContent);
        if (toolData.content) {
          avatarSynthesizer && speakNext(toolData.content.trim());
        }
      } catch (e) {
        console.warn("Error procesando toolContent para speech:", e);
      }
    }
  };

  useEffect(() => {
    fetchpreguntasTxt();
  }, []);

  const activeMicrophone = () => {
    document.getElementById("audioPlayer").play();
    if (!speechRecognizer) {
      console.error("speechRecognizer no está inicializado");
      return;
    }

    // Configurar evento recognized antes de iniciar el reconocimiento
    speechRecognizer.recognized = async (s, e) => {
      if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
        setIsHear(false);
        let userQuery = e.result.text.trim();

        if (userQuery === "") {
          return;
        }
        handleUserQuery(userQuery, "", "");

        // Detener el reconocimiento si se detecta una frase
        speechRecognizer.stopContinuousRecognitionAsync(
          () => {
            console.log(
              "Reconocimiento detenido, listo para escuchar nuevamente."
            );
          },
          (err) => {
            console.log("Error al detener el reconocimiento:", err);
          }
        );
      }
      return;
    };

    // Iniciar reconocimiento
    speechRecognizer.startContinuousRecognitionAsync(
      () => {
        setIsMicrophone(true);
        setIsHear(true);
        console.log("El asistente está escuchando...");
      },
      (err) => {
        setIsHear(false);
        setIsMicrophone(false);
        console.log("cambiar isMicrophone");
        console.error("Error al iniciar el reconocimiento:", err);
      }
    );
  };

  return {
    connectAvatar,
    isLoadingActiveAvatar,
    stopSpeaking,
    sessionActive,
    activeMicrophone,
    isSpeaking,
    messages,
    handleUserQuery,
    setMsg,
    msg,
    disabledMsg,
    avatarSynthesizer,
    isHear,
    disconnectAvatar,
    isMicrophone,
  };
}

export default UseChat;
