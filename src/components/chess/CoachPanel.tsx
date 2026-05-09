import { Loader2, Sparkles, AlertTriangle, Target, Lightbulb, Volume2, BookOpen, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export type CoachAnnotation = {
  quality?: string;
  evalDelta?: number;
  headline?: string;
  narrative?: string;
  threeMovesAhead?: string;
  alternatives?: { san: string; why: string }[];
  betterMove?: string;
  referencedPrinciple?: string;
  opponentThreats?: string[];
};

const QUALITY_LABEL: Record<string, { label: string; color: string }> = {
  brilliant: { label: "Brilliant", color: "text-[oklch(0.55_0.13_220)]" },
  great:     { label: "Great",     color: "text-success" },
  good:      { label: "Good",      color: "text-foreground" },
  inaccuracy:{ label: "Inaccuracy",color: "text-warn" },
  mistake:   { label: "Mistake",   color: "text-warn" },
  blunder:   { label: "Blunder",   color: "text-destructive" },
};

export function CoachPanel({
  annotation, loading, aiIntent, onSpeak, voiceOn,
}: {
  annotation: CoachAnnotation | null;
  loading: boolean;
  aiIntent?: string;
  onSpeak?: (text: string) => void;
  voiceOn?: boolean;
}) {
  if (loading) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        <p className="font-serif italic text-sm">Coach is reading the position…</p>
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

  const speakAll = () => {
    if (!annotation || !onSpeak) return;
    const parts = [annotation.headline, annotation.narrative, annotation.threeMovesAhead].filter(Boolean);
    onSpeak(parts.join(" "));
  };

  return (
    <div className="p-4 space-y-4 text-sm">
      {annotation && (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`serif text-xl ${QUALITY_LABEL[annotation.quality ?? "good"]?.color}`}>
                {QUALITY_LABEL[annotation.quality ?? "good"]?.label ?? "Move"}
              </span>
              {typeof annotation.evalDelta === "number" && Math.abs(annotation.evalDelta) >= 5 && (
                <span className="mono text-xs text-muted-foreground">
                  {annotation.evalDelta > 0 ? "+" : ""}{(annotation.evalDelta / 100).toFixed(2)}
                </span>
              )}
            </div>
            {voiceOn && onSpeak && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={speakAll} title="Speak this">
                <Volume2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>

          {annotation.headline && (
            <p className="serif text-base leading-snug">{annotation.headline}</p>
          )}

          {annotation.narrative && (
            <p className="leading-relaxed text-foreground/90">{annotation.narrative}</p>
          )}

          {annotation.threeMovesAhead && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest mono text-muted-foreground mb-1.5">
                <ArrowRight className="h-3 w-3" /> Three moves ahead
              </div>
              <p className="text-xs text-foreground/90 leading-relaxed">{annotation.threeMovesAhead}</p>
            </div>
          )}

          {annotation.alternatives && annotation.alternatives.length > 0 && (
            <div className="rounded-md border border-accent/40 bg-accent/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest mono text-accent-foreground">
                <Lightbulb className="h-3 w-3" /> Stronger candidates
              </div>
              <ul className="space-y-1.5">
                {annotation.alternatives.slice(0, 3).map((a, i) => (
                  <li key={i} className="flex items-baseline gap-2 text-xs">
                    <span className="serif text-sm text-foreground">{a.san}</span>
                    <span className="text-muted-foreground">— {a.why}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {annotation.opponentThreats && annotation.opponentThreats.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest mono text-muted-foreground mb-1.5">
                <AlertTriangle className="h-3 w-3" /> Opponent's best reply
              </div>
              <ul className="space-y-1">
                {annotation.opponentThreats.map((t, i) => (
                  <li key={i} className="text-xs text-foreground/80 pl-3 border-l-2 border-destructive/50 serif">{t}</li>
                ))}
              </ul>
            </div>
          )}

          {annotation.referencedPrinciple && (
            <div className="flex items-center gap-1.5 text-[10px] mono text-muted-foreground italic pt-1">
              <BookOpen className="h-3 w-3" /> {annotation.referencedPrinciple}
            </div>
          )}
        </>
      )}

      {aiIntent && (
        <div className="pt-3 border-t border-border">
          <div className="text-[10px] uppercase tracking-widest mono text-muted-foreground mb-1">Opponent's intent</div>
          <p className="text-xs italic font-serif">{aiIntent}</p>
        </div>
      )}
    </div>
  );
}
