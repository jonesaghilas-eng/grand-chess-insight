import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export type Annotation = {
  ply: number;
  san: string;
  color: "w" | "b";
  quality?: string;
  comment?: string;
  betterMove?: string;
};

const QUALITY_BADGE: Record<string, { label: string; cls: string }> = {
  brilliant: { label: "!!", cls: "text-[oklch(0.55_0.13_220)]" },
  great: { label: "!", cls: "text-[oklch(0.55_0.13_145)]" },
  good: { label: "✓", cls: "text-muted-foreground" },
  inaccuracy: { label: "?!", cls: "text-warn" },
  mistake: { label: "?", cls: "text-warn" },
  blunder: { label: "??", cls: "text-destructive" },
};

type Props = {
  annotations: Annotation[];
  currentPly: number;
  onSelect: (ply: number) => void;
};

export function MoveList({ annotations, currentPly, onSelect }: Props) {
  const rows: { num: number; white?: Annotation; black?: Annotation }[] = [];
  for (const a of annotations) {
    const num = Math.ceil(a.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || (a.color === "w" && row.white)) {
      row = { num };
      rows.push(row);
    }
    if (a.color === "w") row.white = a;
    else row.black = a;
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-3 py-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground italic font-serif">No moves yet.</p>
        )}
        {rows.map((row) => (
          <div key={row.num} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-1 py-0.5 text-sm">
            <span className="mono text-xs text-muted-foreground">{row.num}.</span>
            <Cell ann={row.white} active={row.white?.ply === currentPly} onSelect={onSelect} />
            <Cell ann={row.black} active={row.black?.ply === currentPly} onSelect={onSelect} />
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function Cell({ ann, active, onSelect }: { ann?: Annotation; active: boolean; onSelect: (ply: number) => void }) {
  if (!ann) return <span />;
  const q = ann.quality ? QUALITY_BADGE[ann.quality] : undefined;
  return (
    <button
      onClick={() => onSelect(ann.ply)}
      className={cn(
        "text-left rounded px-1.5 py-0.5 hover:bg-muted transition-colors flex items-center gap-1.5",
        active && "bg-accent/30 ring-1 ring-accent"
      )}
    >
      <span className="serif">{ann.san}</span>
      {q && <span className={cn("text-xs font-bold", q.cls)}>{q.label}</span>}
    </button>
  );
}
