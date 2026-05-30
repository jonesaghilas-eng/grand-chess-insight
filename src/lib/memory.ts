// Long-term coaching memory. localStorage acts as a synchronous cache so the
// coaching prompt can read weaknesses/headlines without await. When the user
// signs in, the cloud copy is pulled into the cache and every subsequent
// write is mirrored to Supabase. Reads stay synchronous and trivial.

import { supabase } from "@/integrations/supabase/client";
import {
  recordMoveMemory,
  getMemoryContext,
  mergeLocalMemory,
} from "@/lib/memory.functions";

const KEY = "caissa.memory.v2";

export type LearningPoint = {
  ts: number;
  motif: string;
  insight: string;
  weight: number;
};

export type Memory = {
  weaknesses: Record<string, number>;
  strengths: Record<string, number>;
  points: LearningPoint[];
  headlines: string[];
};

const empty = (): Memory => ({ weaknesses: {}, strengths: {}, points: [], headlines: [] });

export function loadMemory(): Memory {
  if (typeof window === "undefined") return empty();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const m = JSON.parse(raw);
    return {
      weaknesses: m.weaknesses ?? {},
      strengths: m.strengths ?? {},
      points: m.points ?? [],
      headlines: m.headlines ?? [],
    };
  } catch {
    return empty();
  }
}

export function saveMemory(m: Memory) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota */ }
}

function isSignedIn(): boolean {
  // Cheap synchronous-ish check via localStorage token (used only for
  // deciding whether to mirror — server validates anyway).
  if (typeof window === "undefined") return false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) return true;
    }
  } catch {}
  return false;
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
    m.headlines = [opts.insight, ...m.headlines.filter((h) => h !== opts.insight)].slice(0, 6);
  }
  saveMemory(m);

  // Mirror to cloud (best-effort, never blocks UI).
  if (isSignedIn() && opts.motifs.length) {
    recordMoveMemory({
      data: {
        quality: opts.quality,
        motifs: opts.motifs,
        insight: opts.insight,
      },
    }).catch(() => { /* offline / RLS — already cached locally */ });
  }
}

export function topWeaknesses(n = 4): string[] {
  return Object.entries(loadMemory().weaknesses)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

export function recentPoints(n = 4): LearningPoint[] {
  return loadMemory().points.slice(0, n);
}

export function recentHeadlines(n = 6): string[] {
  const m = loadMemory();
  if (m.headlines.length) return m.headlines.slice(0, n);
  return m.points.slice(0, n).map((p) => p.insight).filter(Boolean);
}

export function clearMemory() { saveMemory(empty()); }

/**
 * Pull the cloud copy into the local cache. Call on sign-in. Cloud is the
 * source of truth when present; it replaces whatever was cached locally.
 */
export async function hydrateFromCloud(): Promise<void> {
  try {
    const ctx = await getMemoryContext();
    const m = loadMemory();
    const weaknesses: Record<string, number> = {};
    ctx.weaknesses.forEach((w, i) => { weaknesses[w] = ctx.weaknesses.length - i; });
    saveMemory({
      weaknesses,
      strengths: m.strengths,
      points: ctx.points,
      headlines: ctx.headlines,
    });
  } catch {
    /* fall back to whatever is cached */
  }
}

/**
 * On first sign-in, push any locally-recorded points & headlines up so the
 * coach doesn't lose the head-start. Idempotent on subsequent calls (a small
 * amount of duplication is fine — the aggregates dedupe by motif).
 */
export async function mergeLocalIntoCloud(): Promise<void> {
  const m = loadMemory();
  if (!m.points.length && !m.headlines.length) return;
  try {
    await mergeLocalMemory({
      data: {
        points: m.points.slice(0, 80).map((p) => ({
          ts: p.ts,
          motif: p.motif,
          insight: p.insight,
          weight: p.weight,
        })),
        headlines: m.headlines.slice(0, 20),
      },
    });
  } catch { /* best-effort */ }
}

/** Wire on app boot: pull cloud on sign-in, clear cache on sign-out. */
export function bindMemoryToAuth() {
  if (typeof window === "undefined") return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN") {
      void hydrateFromCloud();
    } else if (event === "SIGNED_OUT") {
      clearMemory();
    }
  });
  return () => subscription.unsubscribe();
}
