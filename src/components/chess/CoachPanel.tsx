import { Loader2, Sparkles, AlertTriangle, Target, Lightbulb } from "lucide-react";

type Annotation = {
  quality?: string;
  comment?: string;
  betterMove?: string;
  betterIdea?: string;
  opponentThreats?: string[];
  plan?: string;
  evalDelta?: number;
};

const QUALITY_LABEL: Record<string, { label: string; color: string }> = {
  brilliant: { label: "Brilliant move", color: "text-[oklch(0.55_0.13_220)]" },
  great: { label: "Great move", color: "text-success" },
  good: { label: "Good move", color: "text-foreground" },
  inaccuracy: { label: "Inaccuracy", color: "text-warn" },
  mistake: { label: "Mistake", color: "text-warn" },
  blunder: { label: "Blunder", color: "text-destructive" },
};

export function CoachPanel({
  annotation,
  loading,
  aiIntent,
}: { annotation: Annotation | null; loading: boolean; aiIntent?: string }) {
  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="font-serif italic text-sm">Coach is reviewing your move…</p>
      </div>
    );
  }

  if (!annotation && !aiIntent) {
    return (
      <div className="p-6 text-center text-muted-foreground space-y-2">
        <Sparkles className="h-5 w-5 mx-auto opacity-60" />
        <p className="font-serif italic text-sm">Make a move and the coach will explain it.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 text-sm">
      {annotation && (
        <>
          <div className="flex items-baseline justify-between">
            <span className={`serif text-xl ${QUALITY_LABEL[annotation.quality ?? "good"]?.color}`}>
              {QUALITY_LABEL[annotation.quality ?? "good"]?.label ?? "Move"}
            </span>
            {typeof annotation.evalDelta === "number" && annotation.evalDelta !== 0 && (
              <span className="mono text-xs text-muted-foreground">
                {annotation.evalDelta > 0 ? "+" : ""}{(annotation.evalDelta / 100).toFixed(1)}
              </span>
            )}
          </div>
          {annotation.comment && (
            <p className="leading-relaxed text-foreground/90">{annotation.comment}</p>
          )}
          {annotation.betterMove && (
            <div className="rounded-md border border-accent/40 bg-accent/10 p-3">
              <div className="flex items-center gap-2 mb-1 text-accent-foreground">
                <Lightbulb className="h-3.5 w-3.5" />
                <span className="text-xs uppercase tracking-widest mono">Stronger</span>
                <span className="serif text-base">{annotation.betterMove}</span>
              </div>
              {annotation.betterIdea && <p className="text-xs text-muted-foreground">{annotation.betterIdea}</p>}
            </div>
          )}
          {annotation.opponentThreats && annotation.opponentThreats.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest mono text-muted-foreground mb-1.5">
                <AlertTriangle className="h-3 w-3" /> Their threats
              </div>
              <ul className="space-y-1">
                {annotation.opponentThreats.map((t, i) => (
                  <li key={i} className="text-xs text-foreground/80 pl-3 border-l-2 border-warn/50">{t}</li>
                ))}
              </ul>
            </div>
          )}
          {annotation.plan && (
            <div>
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest mono text-muted-foreground mb-1.5">
                <Target className="h-3 w-3" /> Your plan
              </div>
              <p className="text-xs italic font-serif text-foreground/90">{annotation.plan}</p>
            </div>
          )}
        </>
      )}
      {aiIntent && (
        <div className="pt-3 border-t border-border">
          <div className="text-xs uppercase tracking-widest mono text-muted-foreground mb-1">Opponent's intent</div>
          <p className="text-xs italic font-serif">{aiIntent}</p>
        </div>
      )}
    </div>
  );
}
