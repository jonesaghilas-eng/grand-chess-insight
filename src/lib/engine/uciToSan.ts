// Convert a UCI line (array of "e2e4", "g1f3", "e7e8q") to SAN given a starting FEN.
// Skips moves that fail (engine PVs are normally legal but not always to the end).

import { Chess } from "chess.js";

export function uciLineToSan(fen: string, uciMoves: string[]): string[] {
  const game = new Chess(fen);
  const out: string[] = [];
  for (const u of uciMoves) {
    if (!u || u.length < 4) break;
    const from = u.slice(0, 2);
    const to = u.slice(2, 4);
    const promotion = u.length >= 5 ? u[4] : undefined;
    try {
      const m = game.move({ from, to, promotion });
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

export function uciToSan(fen: string, uci: string): string | null {
  const arr = uciLineToSan(fen, [uci]);
  return arr[0] ?? null;
}
