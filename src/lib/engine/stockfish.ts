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
    // Drain to readyok so the next command starts clean.
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

  bestMove(fen: string, opts: { skillLevel: number; movetimeMs: number }): Promise<string> {
    return this.run(async () => {
      this.worker.postMessage("ucinewgame");
      this.worker.postMessage(`setoption name Skill Level value ${opts.skillLevel}`);
      this.worker.postMessage("setoption name MultiPV value 1");
      await this.send("isready", (l) => l === "readyok");
      this.worker.postMessage(`position fen ${fen}`);
      const lines = await this.send(`go movetime ${opts.movetimeMs}`, (l) => l.startsWith("bestmove"));
      const bm = lines[lines.length - 1];
      const match = bm.match(/^bestmove\s+(\S+)/);
      return match ? match[1] : "(none)";
    });
  }

  analyze(fen: string, opts: { depth: number; multiPV: number }): Promise<AnalysisResult> {
    return this.run(async () => {
      const myToken = ++this.currentSearchToken;
      this.worker.postMessage("ucinewgame");
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
