import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

// Configuración estilo CC (acompaña el audio)
const CPS = 13; // caracteres por segundo de lectura
const MIN_MS = 1500; // mínimo visible (frase corta)
const MAX_MS = 7000; // máximo visible (frase larga)
const LEAD_MS = 400; // margen extra
const MAX_CHARS = 90; // caracteres por subtítulo

// Parte el texto en subtítulos cortos, respetando palabras y puntuación
const splitIntoLines = (text) => {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (candidate.length > MAX_CHARS && current) {
      lines.push(current);
      current = word;
      return;
    }

    current = candidate;

    // corta en puntuación fuerte si el subtítulo ya tiene cuerpo
    if (/[.?!…]$/.test(word) && current.length > MAX_CHARS / 2) {
      lines.push(current);
      current = "";
    }
  });

  if (current) lines.push(current);
  return lines;
};

export default function CaptionsCC({ message }) {
  const [line, setLine] = useState(null); // { id, text, role }
  const timerRef = useRef(null);
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    if (!message?.value?.trim()) {
      setLine(null);
      return;
    }

    const lines = splitIntoLines(message.value);
    let index = 0;

    const showNext = () => {
      const text = lines[index];
      setLine({ id: nextIdRef.current++, text, role: message.role });

      const duration = Math.max(
        MIN_MS,
        Math.min(MAX_MS, Math.round((text.length / CPS) * 1000 + LEAD_MS))
      );

      timerRef.current = setTimeout(() => {
        index += 1;
        if (index < lines.length) {
          showNext();
        } else {
          setLine(null);
        }
      }, duration);
    };

    showNext();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [message]);

  return (
    <div className="absolute bottom-4 left-0 right-0 z-10 flex justify-center px-4 pointer-events-none">
      <AnimatePresence mode="wait">
        {line && (
          <motion.p
            key={line.id}
            className={`max-w-3xl rounded-lg bg-black/70 px-3 py-1 text-center text-lg leading-snug ${
              line.role === "assistant"
                ? "text-white"
                : "italic text-neutral-300"
            }`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {line.text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
