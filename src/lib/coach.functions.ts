import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(body: any) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, ...body }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted. Add credits in Settings → Workspace → Usage.");
    throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

const positionSchema = z.object({
  fen: z.string(),
  pgn: z.string(),
  lastMove: z.string().optional(),
  legalMoves: z.array(z.string()),
  userColor: z.enum(["w", "b"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced", "master"]).default("intermediate"),
});

/** AI selects its next move + gives a short reason for the player. */
export const getAIMove = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => positionSchema.parse(d))
  .handler(async ({ data }) => {
    const strength = {
      beginner: "Play at ~1000 elo. Make natural developing moves; sometimes miss tactics.",
      intermediate: "Play at ~1600 elo. Solid principles, occasional tactical oversights.",
      advanced: "Play at ~2000 elo. Strong tactics and strategy.",
      master: "Play at ~2400 elo. Near-flawless decisions.",
    }[data.difficulty];

    const system = `You are a chess engine + tutor. ${strength}
You MUST respond with valid JSON only (no markdown, no fences):
{"move":"<one move from legalMoves in SAN>","intent":"<one short sentence: what plan you are following>"}
Pick exactly one move from the provided legal moves list. Never invent moves.`;

    const user = `Position FEN: ${data.fen}
PGN so far: ${data.pgn || "(empty)"}
You play: ${data.userColor === "w" ? "Black" : "White"}
Legal moves (SAN): ${data.legalMoves.join(", ")}
Choose your move and state your intent.`;

    const json = await callAI({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const content = json.choices?.[0]?.message?.content ?? "{}";
    let parsed: { move: string; intent: string };
    try {
      parsed = JSON.parse(content);
    } catch {
      parsed = { move: data.legalMoves[0], intent: "Developing naturally." };
    }
    if (!data.legalMoves.includes(parsed.move)) {
      parsed.move = data.legalMoves[0];
      parsed.intent = "Falling back to a safe legal move.";
    }
    return parsed;
  });

const annotateSchema = z.object({
  fenBefore: z.string(),
  fenAfter: z.string(),
  pgn: z.string(),
  userMove: z.string(),
  userColor: z.enum(["w", "b"]),
  legalMovesBefore: z.array(z.string()),
});

/** Pedagogical annotation of the user's last move. */
export const annotateMove = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => annotateSchema.parse(d))
  .handler(async ({ data }) => {
    const system = `You are a world-class chess coach (Magnus-level pedagogy). For the user's last move, return JSON only:
{
  "quality": "brilliant" | "great" | "good" | "inaccuracy" | "mistake" | "blunder",
  "evalDelta": <number, your estimated centipawn change for the player, negative = worse for them>,
  "comment": "<2-3 sentences explaining WHAT happened and WHY in plain language>",
  "betterMove": "<a stronger candidate move in SAN, or empty string if move was best>",
  "betterIdea": "<one sentence: the idea behind the better move, or empty>",
  "opponentThreats": ["<short threat 1>", "<short threat 2>"],
  "plan": "<one sentence: what the player should aim for next>"
}
Be concrete: name pieces, squares, tactical motifs (pin, fork, skewer, discovered attack, weak king), and strategic themes (space, weak squares, pawn structure, king safety). Never invent moves not in the position.`;

    const user = `User plays: ${data.userColor === "w" ? "White" : "Black"}
Position before move (FEN): ${data.fenBefore}
Legal moves that were available: ${data.legalMovesBefore.join(", ")}
User played: ${data.userMove}
Position after move (FEN): ${data.fenAfter}
Game PGN: ${data.pgn}`;

    const json = await callAI({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const content = json.choices?.[0]?.message?.content ?? "{}";
    try {
      return JSON.parse(content);
    } catch {
      return {
        quality: "good",
        evalDelta: 0,
        comment: "Move played.",
        betterMove: "",
        betterIdea: "",
        opponentThreats: [],
        plan: "",
      };
    }
  });

const chatSchema = z.object({
  fen: z.string(),
  pgn: z.string(),
  question: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
});

/** Free-form chat about the current position. */
export const chatAboutPosition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => chatSchema.parse(d))
  .handler(async ({ data }) => {
    const system = `You are a patient, expert chess coach. Always ground answers in the given FEN/PGN.
Use chess notation, name squares and pieces, mention concrete variations when helpful.
Use markdown lists when listing ideas. Keep answers focused and pedagogical.`;
    const user = `FEN: ${data.fen}
PGN: ${data.pgn}

Question: ${data.question}`;
    const json = await callAI({
      messages: [
        { role: "system", content: system },
        ...data.history,
        { role: "user", content: user },
      ],
    });
    return { reply: json.choices?.[0]?.message?.content ?? "I'm not sure." };
  });

const reviewSchema = z.object({
  pgn: z.string(),
  result: z.string(),
  userColor: z.enum(["w", "b"]),
  annotations: z.array(z.object({
    moveNumber: z.number(),
    san: z.string(),
    quality: z.string(),
  })),
});

/** Full game review summary. */
export const reviewGame = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data }) => {
    const system = `You are a chess coach delivering a full post-game review. Return JSON only:
{
  "headline": "<one sentence verdict>",
  "accuracy": <0-100 estimated accuracy for the user>,
  "phases": {
    "opening": "<2 sentences>",
    "middlegame": "<2 sentences>",
    "endgame": "<2 sentences, or 'Game ended before endgame.'>"
  },
  "keyMoments": ["<move N: what happened>", "..."],
  "strengths": ["<short>", "..."],
  "improvements": ["<concrete, actionable>", "..."],
  "studySuggestions": ["<concrete topic / pattern>", "..."]
}`;
    const user = `User played: ${data.userColor === "w" ? "White" : "Black"}
Result: ${data.result}
PGN: ${data.pgn}
Move qualities (user moves only): ${JSON.stringify(data.annotations)}`;

    const json = await callAI({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    const content = json.choices?.[0]?.message?.content ?? "{}";
    try { return JSON.parse(content); }
    catch {
      return { headline: "Game complete.", accuracy: 50, phases: {}, keyMoments: [], strengths: [], improvements: [], studySuggestions: [] };
    }
  });
