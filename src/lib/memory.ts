// Lightweight client-side long-term memory.
// Tracks recurring motif weaknesses + recent learning points so the
// coach can reference them in future prompts. Per-browser (localStorage).
// Cloud-backed memory will replace this once auth is added.

const KEY = "caissa.memory.v1";

export type LearningPoint = {
  ts: number;
  motif: string;       // tag (e.g. "hanging", "back-rank", "open-file")
  insight: string;     // one-sentence takeaway from the coach
  weight: number;      // 0..100 strength
};

export type Memory = {
  weaknesses: Record<string, number>; // motif -> count of negative-quality moves involving it
  strengths: Record<string, number>;
  points: LearningPoint[];            // capped at 40, most-recent-first
};

const empty = (): Memory => ({ weaknesses: {}, strengths: {}, points: [] });

export function loadMemory(): Memory {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const m = JSON.parse(raw);
    return { weaknesses: m.weaknesses ?? {}, strengths: m.strengths ?? {}, points: m.points ?? [] };
  } catch { return empty(); }
}

export function saveMemory(m: Memory) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota */ }
}

export function recordMove(opts: {
  quality: string;
  motifs: string[];
  insight?: string;
}) {
  const m = loadMemory();
  const bad = opts.quality === "mistake" || opts.quality === "blunder" || opts.quality === "inaccuracy";
  const good = opts.quality === "brilliant" || opts.quality === "great";
  for (const tag of opts.motifs) {
    if (bad) m.weaknesses[tag] = (m.weaknesses[tag] ?? 0) + (opts.quality === "blunder" ? 3 : opts.quality === "mistake" ? 2 : 1);
    else if (good) m.strengths[tag] = (m.strengths[tag] ?? 0) + 1;
  }
  if (opts.insight && (bad || good)) {
    m.points.unshift({
      ts: Date.now(),
      motif: opts.motifs[0] ?? "general",
      insight: opts.insight,
      weight: bad ? 80 : 50,
    });
    m.points = m.points.slice(0, 40);
  }
  saveMemory(m);
}

export function topWeaknesses(n = 4): string[] {
  const m = loadMemory();
  return Object.entries(m.weaknesses).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

export function recentPoints(n = 4): LearningPoint[] {
  return loadMemory().points.slice(0, n);
}

export function clearMemory() { saveMemory(empty()); }
