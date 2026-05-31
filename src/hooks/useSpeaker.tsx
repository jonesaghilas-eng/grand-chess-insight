import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { speakText } from "@/lib/coach.functions";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

let currentAudio: HTMLAudioElement | null = null;

export function useSpeaker() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const speakFn = useServerFn(speakText);
  const tokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    };
  }, []);

  function stop() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setSpeaking(false);
  }

  async function speak(text: string) {
    if (!enabled || !text) return;
    const myToken = ++tokenRef.current;
    stop();
    setSpeaking(true);
    try {
      const { audioBase64 } = await speakFn({ data: { text: text.slice(0, 1500), voiceId: "IKne3meq5aSn9XLyUdCD" } });
      if (myToken !== tokenRef.current) return;
      const audio = new Audio(`data:audio/mpeg;base64,${audioBase64}`);
      currentAudio = audio;
      audio.onended = () => { if (currentAudio === audio) { setSpeaking(false); currentAudio = null; } };
      audio.onerror = () => { setSpeaking(false); currentAudio = null; };
      await audio.play();
    } catch {
      setSpeaking(false);
    }
  }

  return { enabled, setEnabled, speaking, speak, stop };
}

export function VoiceToggle({ enabled, onToggle, speaking }: { enabled: boolean; onToggle: () => void; speaking: boolean }) {
  return (
    <Button variant={enabled ? "default" : "outline"} size="sm" onClick={onToggle} title={enabled ? "Mute coach" : "Let the coach speak"}>
      {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  );
}
