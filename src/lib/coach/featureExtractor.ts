// Lightweight, dependency-free feature extraction from a chess.js game state.
// We tag motifs/phases that the theoryBank uses for retrieval and that the
// translator references in plain language. No engine — purely structural.

import { Chess, type Move } from "chess.js";
import type { Phase } from "./theoryBank";

export type Features = {
  phase: Phase;
  moveNumber: number;
  motifs: string[];               // tags
  hangingPieces: { square: string; piece: string; color: "w" | "b" }[];
  inCheck: boolean;
  lastMove?: Move;
  materialBalance: number;        // +ve = white ahead (in pawns)
  openingName?: string;
};

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const OPENING_HINTS: Array<{ pgnPrefix: string; name: string }> = [
  { pgnPrefix: "1. e4 e5 2. Nf3 Nc6 3. Bb5", name: "Ruy López" },
  { pgnPrefix: "1. e4 e5 2. Nf3 Nc6 3. Bc4", name: "Italian Game" },
  { pgnPrefix: "1. e4 c5", name: "Sicilian Defence" },
  { pgnPrefix: "1. e4 e6", name: "French Defence" },
  { pgnPrefix: "1. e4 c6", name: "Caro-Kann" },
  { pgnPrefix: "1. e4 e5 2. Nf3 Nf6", name: "Petroff Defence" },
  { pgnPrefix: "1. d4 d5 2. c4", name: "Queen's Gambit" },
  { pgnPrefix: "1. d4 Nf6 2. c4 g6", name: "King's Indian / Grünfeld complex" },
  { pgnPrefix: "1. d4 Nf6 2. c4 e6", name: "Nimzo / Queen's Indian complex" },
  { pgnPrefix: "1. Nf3", name: "Réti Opening" },
  { pgnPrefix: "1. c4", name: "English Opening" },
];

export function extractFeatures(game: Chess, lastMove?: Move): Features {
  const motifs = new Set<string>();
  const board = game.board(); // 8x8, [0]=rank8
  const ply = game.history().length;
  const moveNumber = Math.ceil(ply / 2);
  const phase = derivePhase(board, ply);
  motifs.add(phase);

  // Material balance + hanging pieces (pieces with attackers > defenders)
  let mat = 0;
  const hanging: Features["hangingPieces"] = [];
  const sideToMove = game.turn();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const sq = board[r][f];
      if (!sq) continue;
      const sign = sq.color === "w" ? 1 : -1;
      mat += sign * PIECE_VALUE[sq.type];
      if (sq.type === "k") continue;
      const algebraic = `${"abcdefgh"[f]}${8 - r}` as string;
      const attackers = countAttackers(game, algebraic, sq.color === "w" ? "b" : "w");
      const defenders = countAttackers(game, algebraic, sq.color);
      if (attackers > defenders) {
        hanging.push({ square: algebraic, piece: sq.type, color: sq.color });
        motifs.add("hanging");
        motifs.add("loose-piece");
      }
    }
  }

  if (game.inCheck()) motifs.add("check");
  if (lastMove?.captured) motifs.add("capture");
  if (lastMove?.flags.includes("k") || lastMove?.flags.includes("q")) {
    motifs.add("castling");
    motifs.add("king-safety");
  }
  if (lastMove?.piece === "n") motifs.add("knight");
  if (lastMove?.piece === "b") motifs.add("bishop");
  if (lastMove?.piece === "q" && ply <= 12) motifs.add("queen-out");
  if (lastMove && /[+#]/.test(lastMove.san)) motifs.add("forcing-line");

  // Phase-specific motifs
  if (phase === "opening") {
    motifs.add("development");
    motifs.add("centre");
  }
  if (phase === "endgame") {
    motifs.add("king-activity");
    if (hasPassedPawn(board)) motifs.add("passed-pawn");
  }

  // Open file detection (rough)
  for (let f = 0; f < 8; f++) {
    let pawns = 0;
    for (let r = 0; r < 8; r++) if (board[r][f]?.type === "p") pawns++;
    if (pawns === 0) motifs.add("open-file");
  }

  return {
    phase,
    moveNumber,
    motifs: Array.from(motifs),
    hangingPieces: hanging,
    inCheck: game.inCheck(),
    lastMove,
    materialBalance: mat,
    openingName: detectOpening(game.pgn()),
    // sideToMove used elsewhere if needed
    ...(sideToMove ? {} : {}),
  };
}

function derivePhase(board: ReturnType<Chess["board"]>, ply: number): Phase {
  let pieces = 0, queens = 0;
  for (const row of board) for (const sq of row) {
    if (!sq) continue;
    if (sq.type !== "p" && sq.type !== "k") pieces++;
    if (sq.type === "q") queens++;
  }
  if (ply < 16 && pieces >= 12) return "opening";
  if (queens === 0 && pieces <= 6) return "endgame";
  if (pieces <= 8) return "endgame";
  return "middlegame";
}

function hasPassedPawn(board: ReturnType<Chess["board"]>): boolean {
  // Simple: a pawn is passed if no enemy pawn is on its file or adjacent files ahead of it.
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const sq = board[r][f];
    if (!sq || sq.type !== "p") continue;
    const dir = sq.color === "w" ? -1 : 1;
    let blocked = false;
    for (let rr = r + dir; rr >= 0 && rr < 8; rr += dir) {
      for (const ff of [f - 1, f, f + 1]) {
        if (ff < 0 || ff > 7) continue;
        const t = board[rr][ff];
        if (t && t.type === "p" && t.color !== sq.color) { blocked = true; break; }
      }
      if (blocked) break;
    }
    if (!blocked) return true;
  }
  return false;
}

function countAttackers(game: Chess, square: string, byColor: "w" | "b"): number {
  // chess.js doesn't expose an `attackers` API across versions reliably,
  // so we approximate: clone position, set side-to-move = byColor, count
  // legal moves landing on `square`.
  const fen = game.fen().split(" ");
  fen[1] = byColor;
  // Reset en-passant + castling to neutral to avoid illegal-castle complaints
  fen[2] = "-";
  fen[3] = "-";
  let probe: Chess;
  try { probe = new Chess(fen.join(" ")); } catch { return 0; }
  const moves = probe.moves({ verbose: true }) as Move[];
  return moves.filter((m) => m.to === square && (m.captured || m.flags.includes("e"))).length;
}

function detectOpening(pgn: string): string | undefined {
  const cleaned = pgn.replace(/\{[^}]*\}/g, "").trim();
  let best: string | undefined;
  let bestLen = 0;
  for (const o of OPENING_HINTS) {
    if (cleaned.startsWith(o.pgnPrefix) && o.pgnPrefix.length > bestLen) {
      best = o.name;
      bestLen = o.pgnPrefix.length;
    }
  }
  return best;
}
