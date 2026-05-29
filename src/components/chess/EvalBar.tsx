import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  /** -1500..1500 centipawns, positive = white better */
  score: number;
};

export function EvalBar({ score }: Props) {
  // Tween animation
  const [shown, setShown] = useState(score);
  const fromRef = useRef(score);
  const startRef = useRef(0);
  useEffect(() => {
    const from = shown;
    fromRef.current = from;
    startRef.current = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - startRef.current) / 350);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(from + (score - from) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [score]);

  const clamped = Math.max(-1500, Math.min(1500, shown));
  const whitePct = 50 + (clamped / 1500) * 46;
  const display = (Math.abs(shown) / 100).toFixed(1);
  const sign = shown > 5 ? "+" : shown < -5 ? "−" : "";

  return (
    <div className="flex flex-col items-center gap-1.5 group">
      <span className={cn("mono text-[10px] tabular-nums", shown >= 0 ? "text-foreground" : "text-muted-foreground")}>
        {sign}{display}
      </span>
      <div className="relative w-2 flex-1 min-h-[260px] rounded-full overflow-hidden bg-foreground/90 ring-1 ring-border">
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: `${whitePct}%`,
            background: "linear-gradient(to top, oklch(0.99 0.005 85), oklch(0.94 0.012 85))",
          }}
        />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gold opacity-60" />
      </div>
    </div>
  );
}
