import { cn } from "@/lib/utils";

type Props = {
  /** -1000..1000 centipawn-ish, positive = white better */
  score: number;
};

export function EvalBar({ score }: Props) {
  const clamped = Math.max(-1000, Math.min(1000, score));
  const whitePct = 50 + (clamped / 1000) * 45;
  const display = (Math.abs(score) / 100).toFixed(1);
  const sign = score > 0 ? "+" : score < 0 ? "−" : "";
  return (
    <div className="flex flex-col items-center gap-2">
      <span className={cn("mono text-xs", score >= 0 ? "text-foreground" : "text-muted-foreground")}>
        {sign}{display}
      </span>
      <div className="relative w-3 h-[420px] rounded-sm overflow-hidden border border-border bg-foreground">
        <div
          className="absolute bottom-0 left-0 right-0 bg-paper transition-all duration-500 ease-out"
          style={{ height: `${whitePct}%` }}
        />
        <div className="absolute left-0 right-0 top-1/2 h-px bg-gold" />
      </div>
    </div>
  );
}
