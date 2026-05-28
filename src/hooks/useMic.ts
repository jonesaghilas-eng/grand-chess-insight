import { useEffect, useRef, useState, useCallback } from "react";

// Push-to-talk wrapper around the browser SpeechRecognition API.
// Returns transcript text on stop. Graceful no-op if unsupported.

type SR = any;

export function useMic(opts: { lang?: string; onResult?: (text: string) => void } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SR | null>(null);
  const finalRef = useRef<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(Boolean(Ctor));
  }, []);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    const Ctor: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) return;
    const rec: SR = new Ctor();
    rec.lang = opts.lang ?? "en-US";
    rec.interimResults = true;
    rec.continuous = true;
    finalRef.current = "";
    rec.onresult = (e: any) => {
      let interimText = "";
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interimText += t;
      }
      if (finalText) finalRef.current += finalText;
      setInterim(interimText);
    };
    rec.onerror = () => { setListening(false); };
    rec.onend = () => {
      setListening(false);
      const text = (finalRef.current + " " + interim).trim();
      setInterim("");
      if (text) opts.onResult?.(text);
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.lang]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* */ }
  }, []);

  return { supported, listening, interim, start, stop };
}
