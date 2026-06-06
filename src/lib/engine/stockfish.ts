// Browser-only Stockfish 18 (lite, single-threaded WASM) wrapper.
// Files served from /public/stockfish/. Single-threaded so no COOP/COEP headers needed.

export type EngineLine = {
  multipv: number;
  depth: number;
  scoreCp: number | null;
  mate: number | null;
  pv: string[];
};

export type AnalysisResult = {
  fen: string;
  depth: number;
  bestmove: string | null;
  lines: EngineLine[];
};

export type Persona = "balanced" | "attacker" | "positional" | "gambiteer" | "grinder";

const ENGINE_URL = "/stockfish/stockfish-18-lite-single.js";

let _enginePromise: Promise<StockfishEngine> | null = null;

export function getEngine(): Promise<StockfishEngine> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Stockfish only runs in the browser"));
  }
  if (!_enginePromise) {
    _enginePromise = StockfishEngine.create().catch((e) => {
      _enginePromise = null;
      throw e;
    });
  }
  return _enginePromise;
}

class StockfishEngine {
  private worker: Worker;
  private listeners: Array<(line: string) => void> = [];
  private busy: Promise<void> = Promise.resolve();
  private currentSearchToken = 0;

  private constructor(worker: Worker) {
    this.worker = worker;
    this.worker.onmessage = (e: MessageEvent) => {
      const text = typeof e.data === "string" ? e.data : String(e.data);
      for (const fn of this.listeners) fn(text);
    };
  }

  static async create(): Promise<StockfishEngine> {
    const worker = new Worker(ENGINE_URL);
    const eng = new StockfishEngine(worker);
    await eng.send("uci", (l) => l === "uciok");
    await eng.send("isready", (l) => l === "readyok");
    return eng;
  }

  private addListener(fn: (l: string) => void) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((x) => x !== fn); };
  }

  private send(cmd: string, until: (line: string) => boolean): Promise<string[]> {
    return new Promise((resolve) => {
      const collected: string[] = [];
      const off = this.addListener((line) => {
        collected.push(line);
        if (until(line)) { off(); resolve(collected); }
      });
      this.worker.postMessage(cmd);
    });
  }

  /** Cancel any in-flight search. */
  async cancel(): Promise<void> {
    this.currentSearchToken++;
    this.worker.postMessage("stop");
    try { await this.send("isready", (l) => l === "readyok"); } catch { /* */ }
  }

  /** Serialize commands so concurrent calls don't interleave. */
  private async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.busy;
    let release: () => void;
    this.busy = new Promise((r) => (release = r));
    await prev;
    try { return await fn(); }
    finally { release!(); }
  }

  /**
   * Pick a move at a target ELO and persona.
   * - ELO ≥ 1320: use UCI_LimitStrength + UCI_Elo (Stockfish's calibrated curve).
   * - ELO < 1320: fall back to Skill Level mapping (skill 0 ≈ 800, skill 20 ≈ 2800+).
   * - Persona biases move selection via MultiPV sampling among top candidates.
   */
  pickMove(fen: string, opts: { elo: number; persona: Persona; movetimeMs: number }): Promise<string> {
    return this.run(async () => {
      this.worker.postMessage("ucinewgame");

      // Strength configuration
      if (opts.elo >= 1320) {
        this.worker.postMessage("setoption name UCI_LimitStrength value true");
        this.worker.postMessage(`setoption name UCI_Elo value ${Math.min(3190, Math.max(1320, opts.elo))}`);
        this.worker.postMessage("setoption name Skill Level value 20");
      } else {
        // Below the UCI_Elo floor, use Skill Level: roughly 0→800, 20→2400.
        this.worker.postMessage("setoption name UCI_LimitStrength value false");
        const skill = Math.max(0, Math.min(20, Math.round((opts.elo - 800) / 80)));
        this.worker.postMessage(`setoption name Skill Level value ${skill}`);
      }

      // Persona: most personas want a few candidates to choose from.
      const wantMulti = opts.persona !== "balanced" && opts.persona !== "positional";
      const multiPV = wantMulti ? 3 : 1;
      this.worker.postMessage(`setoption name MultiPV value ${multiPV}`);
      await this.send("isready", (l) => l === "readyok");

      this.worker.postMessage(`position fen ${fen}`);
      const out = await this.send(`go movetime ${opts.movetimeMs}`, (l) => l.startsWith("bestmove"));

      // Collect deepest line per multipv index
      const byPv = new Map<number, EngineLine>();
      let bestmove: string | null = null;
      for (const line of out) {
        if (line.startsWith("bestmove")) {
          const m = line.match(/^bestmove\s+(\S+)/);
          bestmove = m ? m[1] : null;
          continue;
        }
        if (!line.startsWith("info ")) continue;
        const mpv = /\bmultipv (\d+)/.exec(line);
        const dep = /\bdepth (\d+)/.exec(line);
        const cp = /\bscore cp (-?\d+)/.exec(line);
        const mate = /\bscore mate (-?\d+)/.exec(line);
        const pv = /\bpv (.+)$/.exec(line);
        if (!mpv || !dep || !pv) continue;
        const idx = Number(mpv[1]);
        const depth = Number(dep[1]);
        const existing = byPv.get(idx);
        if (existing && existing.depth >= depth) continue;
        byPv.set(idx, {
          multipv: idx, depth,
          scoreCp: cp ? Number(cp[1]) : null,
          mate: mate ? Number(mate[1]) : null,
          pv: pv[1].trim().split(/\s+/),
        });
      }

      const candidates = Array.from(byPv.values()).sort((a, b) => a.multipv - b.multipv);
      if (candidates.length === 0) return bestmove ?? "(none)";

      const picked = pickByPersona(candidates, opts.persona);
      return picked.pv[0] ?? bestmove ?? "(none)";
    });
  }

  analyze(fen: string, opts: { depth: number; multiPV: number }): Promise<AnalysisResult> {
    return this.run(async () => {
      const myToken = ++this.currentSearchToken;
      this.worker.postMessage("ucinewgame");
      this.worker.postMessage("setoption name UCI_LimitStrength value false");
      this.worker.postMessage("setoption name Skill Level value 20");
      this.worker.postMessage(`setoption name MultiPV value ${opts.multiPV}`);
      await this.send("isready", (l) => l === "readyok");
      if (myToken !== this.currentSearchToken) {
        return { fen, depth: opts.depth, bestmove: null, lines: [] };
      }
      this.worker.postMessage(`position fen ${fen}`);
      const out = await this.send(`go depth ${opts.depth}`, (l) => l.startsWith("bestmove"));

      const byPv = new Map<number, EngineLine>();
      let bestmove: string | null = null;

      for (const line of out) {
        if (line.startsWith("bestmove")) {
          const m = line.match(/^bestmove\s+(\S+)/);
          bestmove = m ? m[1] : null;
          continue;
        }
        if (!line.startsWith("info ")) continue;
        const mpv = /\bmultipv (\d+)/.exec(line);
        const dep = /\bdepth (\d+)/.exec(line);
        const cp = /\bscore cp (-?\d+)/.exec(line);
        const mate = /\bscore mate (-?\d+)/.exec(line);
        const pv = /\bpv (.+)$/.exec(line);
        if (!mpv || !dep || !pv) continue;
        const idx = Number(mpv[1]);
        const depth = Number(dep[1]);
        const existing = byPv.get(idx);
        if (existing && existing.depth >= depth) continue;
        byPv.set(idx, {
          multipv: idx,
          depth,
          scoreCp: cp ? Number(cp[1]) : null,
          mate: mate ? Number(mate[1]) : null,
          pv: pv[1].trim().split(/\s+/),
        });
      }

      const lines = Array.from(byPv.values()).sort((a, b) => a.multipv - b.multipv);
      return { fen, depth: opts.depth, bestmove, lines };
    });
  }
}

/**
 * Score each candidate by persona preference, then pick.
 * Candidates are already engine-ranked; persona may demote/promote based on style.
 */
function pickByPersona(cands: EngineLine[], persona: Persona): EngineLine {
  const top = cands[0];
  if (cands.length === 1 || persona === "balanced" || persona === "positional") return top;

  // Eval-relative penalty for diverging from the top line (in centipawns).
  // Personas accept giving up some eval for stylistic moves.
  const tolerance: Record<Persona, number> = {
    balanced: 0, positional: 0,
    attacker: 60,
    gambiteer: 110,
    grinder: 35,
  };
  const tol = tolerance[persona];

  const scored = cands.map((c) => {
    const cp = c.mate != null ? (c.mate > 0 ? 100000 : -100000) : (c.scoreCp ?? 0);
    const topCp = top.mate != null ? (top.mate > 0 ? 100000 : -100000) : (top.scoreCp ?? 0);
    const loss = topCp - cp; // positive = worse than top
    if (loss > tol) return { c, score: -Infinity };

    // Style bonus from first ply of the candidate (UCI string).
    const move = c.pv[0] ?? "";
    let bonus = -loss; // start with eval penalty
    if (persona === "attacker") {
      // Bonus for captures/promotions (UCI captures aren't marked, but promotion has 5 chars).
      if (move.length === 5) bonus += 40; // promotion
      // Heuristic: pieces moving toward enemy half tend to be attacks.
      // Use destination rank (4th char).
      const toRank = Number(move[3]);
      if (toRank >= 5) bonus += 15;
    } else if (persona === "gambiteer") {
      if (move.length === 5) bonus += 30;
      if (loss > 30 && loss <= tol) bonus += 50; // actively rewards "spicy" sacrifices
    } else if (persona === "grinder") {
      // Prefers the safest top move; small bonus to top-1, tiny bonus to top-2.
      bonus += c.multipv === 1 ? 20 : c.multipv === 2 ? 5 : 0;
    }
    return { c, score: bonus };
  });

  scored.sort((a, b) => b.score - a.score);
  const viable = scored.filter((s) => s.score > -Infinity);
  if (viable.length === 0) return top;

  // Weighted sample among viable top 2 to add variety (not always the same pick).
  if (viable.length >= 2 && Math.random() < 0.35) return viable[1].c;
  return viable[0].c;
}
