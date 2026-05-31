import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { speakText } from "@/lib/coach.functions";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

let currentAudio: HTMLAudioElement | null = null;

// Global audio-unlock state. Browsers (esp. iOS Safari) block audio.play()
// until the user has interacted with the page. We listen once for any
// pointer/key/touch event, then play a silent clip to unlock the audio
// channel for the rest of the session.
let audioUnlocked = false;
const unlockListeners = new Set<() => void>();

function primeAudio() {
  if (audioUnlocked) return;
  try {
    // Tiny silent mp3 (≈ 0.05s). Playing this inside a user gesture
    // unlocks subsequent programmatic Audio().play() calls.
    const silent = new Audio(
      "data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//FRADBQBQBgBQAQAAANIAAAAYAAA"
    );
    silent.volume = 0;
    const p = silent.play();
    if (p) p.then(() => { audioUnlocked = true; unlockListeners.forEach((f) => f()); }).catch(() => {});
  } catch {}
}

if (typeof window !== "undefined") {
  const onGesture = () => {
    primeAudio();
    if (audioUnlocked) {
      window.removeEventListener("pointerdown", onGesture);
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("touchstart", onGesture);
    }
  };
  window.addEventListener("pointerdown", onGesture, { passive: true });
  window.addEventListener("keydown", onGesture);
  window.addEventListener("touchstart", onGesture, { passive: true });
}

export function useSpeaker() {
  const [enabled, setEnabled] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(!audioUnlocked);
  const speakFn = useServerFn(speakText);
  const tokenRef = useRef(0);
  const pendingRef = useRef<string | null>(null);

  useEffect(() => {
    const onUnlock = () => {
      setNeedsUnlock(false);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) speak(pending);
    };
    unlockListeners.add(onUnlock);
    return () => {
      unlockListeners.delete(onUnlock);
      if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setSpeaking(false);
  }

  async function speak(text: string) {
    if (!enabled || !text) return;
    // If audio hasn't been unlocked yet, queue the latest line and wait
    // for the first user gesture (handled by the global listener above).
    if (!audioUnlocked) {
      pendingRef.current = text;
      setNeedsUnlock(true);
      return;
    }
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
      try {
        await audio.play();
      } catch (err: any) {
        // Autoplay blocked — fall back to queueing and re-prompt for gesture.
        if (err?.name === "NotAllowedError") {
          audioUnlocked = false;
          pendingRef.current = text;
          setNeedsUnlock(true);
        }
        setSpeaking(false);
      }
    } catch {
      setSpeaking(false);
    }
  }

  return { enabled, setEnabled, speaking, speak, stop, needsUnlock };
}

export function VoiceToggle({ enabled, onToggle, speaking }: { enabled: boolean; onToggle: () => void; speaking: boolean }) {
  return (
    <Button variant={enabled ? "default" : "outline"} size="sm" onClick={onToggle} title={enabled ? "Mute coach" : "Let the coach speak"}>
      {speaking ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </Button>
  );
}
