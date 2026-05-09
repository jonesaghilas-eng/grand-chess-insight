export type DisplayLine = {
  rank: number;
  scoreCp: number | null;
  mate: number | null;
  pvSan: string[];
};

type Props = {
  lines: DisplayLine[];
  loading?: boolean;
  onHover?: (line: DisplayLine | null) => void;
  onSelect?: (line: DisplayLine) => void;
  sideToMove: "w" | "b";
};

export function LinesPanel({ lines, loading, onHover, onSelect, sideToMove }: Props) {
  return (
    <div className="border border-border rounded-lg bg-card ink-shadow flex flex-col">
      <div className="px-3 py-2 border-b border-border flex items-baseline justify-between">
        <span className="serif text-base">Top engine lines</span>
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Stockfish 18 · {sideToMove === "w" ? "white" : "black"} to move
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading && lines.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground italic font-serif">Engine warming up…</div>
        )}
        {!loading && lines.length === 0 && (
          <div className="p-4 text-center text-xs text-muted-foreground italic font-serif">No analysis yet.</div>
        )}
        <ul className="divide-y divide-border">
          {lines.map((l) => (
            <li
              key={l.rank}
              onMouseEnter={() => onHover?.(l)}
              onMouseLeave={() => onHover?.(null)}
              onClick={() => onSelect?.(l)}
              className="px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="mono text-[10px] text-muted-foreground w-4 text-right">{l.rank}.</span>
                  <span className="serif text-sm truncate">{l.pvSan.slice(0, 6).join(" ")}</span>
                </div>
                <span className="mono text-xs text-foreground/80 whitespace-nowrap">
                  {l.mate != null ? `#${Math.abs(l.mate)}` : `${(l.scoreCp ?? 0) / 100 >= 0 ? "+" : ""}${((l.scoreCp ?? 0) / 100).toFixed(2)}`}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
