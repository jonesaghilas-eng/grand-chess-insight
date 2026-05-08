import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";

type Review = {
  headline?: string;
  accuracy?: number;
  phases?: { opening?: string; middlegame?: string; endgame?: string };
  keyMoments?: string[];
  strengths?: string[];
  improvements?: string[];
  studySuggestions?: string[];
};

export function ReviewDialog({
  open, onOpenChange, review, loading,
}: { open: boolean; onOpenChange: (o: boolean) => void; review: Review | null; loading: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="serif text-3xl">Game Review</DialogTitle>
        </DialogHeader>
        {loading && (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            <p className="font-serif italic">Compiling your full review…</p>
          </div>
        )}
        {review && !loading && (
          <div className="space-y-6">
            {review.headline && (
              <div>
                <p className="serif text-xl text-foreground">{review.headline}</p>
                {typeof review.accuracy === "number" && (
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="mono text-4xl text-accent">{review.accuracy}</span>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground mono">accuracy</span>
                  </div>
                )}
              </div>
            )}
            <div className="gold-rule" />
            {review.phases && (
              <div className="space-y-3">
                {(["opening", "middlegame", "endgame"] as const).map((p) => review.phases?.[p] && (
                  <div key={p}>
                    <div className="text-xs uppercase tracking-widest mono text-muted-foreground mb-1">{p}</div>
                    <p className="text-sm leading-relaxed">{review.phases[p]}</p>
                  </div>
                ))}
              </div>
            )}
            <Section title="Key moments" items={review.keyMoments} />
            <Section title="What you did well" items={review.strengths} accent />
            <Section title="What to improve" items={review.improvements} />
            <Section title="Study next" items={review.studySuggestions} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, items, accent }: { title: string; items?: string[]; accent?: boolean }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-xs uppercase tracking-widest mono text-muted-foreground mb-2">{title}</div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className={`text-sm pl-3 border-l-2 ${accent ? "border-accent" : "border-border"}`}>{it}</li>
        ))}
      </ul>
    </div>
  );
}
