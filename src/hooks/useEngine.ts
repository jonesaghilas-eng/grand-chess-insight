import { useEffect, useState } from "react";
import { getEngine } from "@/lib/engine/stockfish";

export function useEngine() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getEngine()
      .then(() => { if (!cancelled) setReady(true); })
      .catch((e) => { if (!cancelled) setError(e?.message ?? "Engine init failed"); });
    return () => { cancelled = true; };
  }, []);
  return { ready, error };
}
