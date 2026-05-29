// Server functions: the LLM is now a TRANSLATOR, not an engine.
// Stockfish (client-side) provides ground truth; this layer renders that
// truth into elite-pedagogical coaching, retrieving theory from the bank.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function callAI(body: any, opts: { timeoutMs?: number } = {}) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("LOVABLE_API_KEY not configured");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 15000);
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, ...body }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment.");
      if (res.status === 402) throw new Error("AI credits exhausted.");
      throw new Error(`AI gateway error ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

const lineSchema = z.object({
  multipv: z.number(),
  scoreCp: z.number().nullable(),
  mate: z.number().nullable(),
  pvSan: z.array(z.string()), // PV converted to SAN before sending
});

const translateSchema = z.object({
  fenBefore: z.string(),
  fenAfter: z.string(),
  pgn: z.string(),
  userMove: z.string(), // SAN
  userColor: z.enum(["w", "b"]),
  evalBeforeCp: z.number().nullable(),  // engine eval of fenBefore from user POV (centipawns)
  evalAfterCp: z.number().nullable(),   // engine eval of fenAfter from opp POV; we'll flip to user POV
  topLines: z.array(lineSchema).max(5),
  features: z.object({
    phase: z.enum(["opening", "middlegame", "endgame"]),
    motifs: z.array(z.string()),
    hangingPieces: z.array(z.object({ square: z.string(), piece: z.string(), color: z.enum(["w","b"]) })),
    materialBalance: z.number(),
    openingName: z.string().optional(),
  }),
  principles: z.array(z.object({ id: z.string(), text: z.string(), source: z.string().optional() })).max(4),
  level: z.enum(["beginner", "intermediate", "advanced", "master"]),
  opponentBestReplySan: z.string().optional(), // best engine reply, SAN
  threeMoveLineSan: z.array(z.string()).optional(), // first 3 plies of opponent's plan
  recurringWeaknesses: z.array(z.string()).max(6).optional(),
  recentInsights: z.array(z.string()).max(4).optional(),
  recentHeadlines: z.array(z.string()).max(6).optional(),
});

function classifyQuality(deltaCp: number, mateSwing: boolean): string {
  if (mateSwing && deltaCp < 0) return "blunder";
  if (deltaCp >= 100) return "brilliant";
  if (deltaCp >= 30) return "great";
  if (deltaCp >= -20) return "good";
  if (deltaCp >= -80) return "inaccuracy";
  if (deltaCp >= -200) return "mistake";
  return "blunder";
}

/** Translate raw engine analysis + extracted features into a didactic coaching object. */
export const translateAnalysis = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => translateSchema.parse(d))
  .handler(async ({ data }) => {
    // Compute eval delta from user's POV (positive = user better)
    const before = data.evalBeforeCp ?? 0;
    // evalAfterCp arrives from opponent POV; flip
    const afterFromUser = data.evalAfterCp == null ? before : -data.evalAfterCp;
    const deltaCp = afterFromUser - before;
    const wasTopLine = data.topLines[0] && Math.abs(deltaCp) <= 10;
    const quality = wasTopLine ? "great" : classifyQuality(deltaCp, false);

    // Better move = top line different from played, only if we actually lost ground
    const top = data.topLines[0];
    const betterMove = !wasTopLine && top?.pvSan?.[0] && top.pvSan[0] !== data.userMove ? top.pvSan[0] : "";

    const principlesBlock = data.principles.length
      ? data.principles.map((p) => `- (${p.id}${p.source ? `, ${p.source}` : ""}) ${p.text}`).join("\n")
      : "(no specific principles retrieved)";

    const linesBlock = data.topLines.map((l, i) => {
      const score = l.mate != null ? `mate in ${l.mate}` : `${(l.scoreCp ?? 0) / 100 >= 0 ? "+" : ""}${((l.scoreCp ?? 0) / 100).toFixed(2)}`;
      return `${i + 1}. ${l.pvSan.slice(0, 5).join(" ")}  [${score}]`;
    }).join("\n");

    const system = `You are an elite chess coach in the tradition of Dvoretsky, Aagaard, and Silman. Your job is NOT to evaluate — Stockfish has done that. Your job is to TRANSLATE engine truth into clear, human, didactic coaching that makes the player stronger.

Voice & personality:
- Warm but precise. No filler ("Great job!"), no hedging ("might be"). Concrete.
- Name pieces and squares. Speak in chess vocabulary the player can grow into.
- One vivid sentence > three vague ones.
- When you cite a principle, weave it in — never quote it verbatim like a textbook.
- Adapt to player level (${data.level}): more concrete tactics for beginners, more nuance for masters.
- HARD RULE — do not restate any of the player's recent coaching headlines (provided below). If the same idea applies, reference it as a callback ("same shape as before — …") rather than repeating the phrase.
- When a recurring weakness re-appears in the position, name it explicitly as a callback so the player feels the through-line across games.

Return JSON ONLY (no markdown), matching this exact shape:
{
  "headline": "<short verdict, one phrase>",
  "narrative": "<2–4 sentences: what the move does, why it works or doesn't, naming squares and pieces>",
  "threeMovesAhead": "<one sentence forward-looking plan>",
  "deepen": "<2–4 sentences of deeper chess theory: positional assessment, named principle and its source (e.g. 'Nimzowitsch, My System — prophylaxis'), and how the forcing line below punishes the move; this is shown on demand>",
  "captionedPlies": [
    { "san": "<SAN of opp ply 1>", "caption": "<one short sentence on what this move accomplishes>" },
    { "san": "<SAN of opp ply 2>", "caption": "<...>" },
    { "san": "<SAN of opp ply 3>", "caption": "<...>" }
  ],
  "alternatives": [
    { "san": "<SAN>", "why": "<one sentence>" },
    { "san": "<SAN>", "why": "<one sentence>" }
  ],
  "referencedPrinciple": "<short attribution like 'Nimzowitsch — prophylaxis' or empty string>",
  "personaTone": "<one of: pleased, neutral, concerned, worried, impressed>"
}
If there is no forcing 3-ply line, return captionedPlies as an empty array.`;

    const user = `LEVEL: ${data.level}
PHASE: ${data.features.phase} (move ${Math.ceil((data.pgn.split(/\s+/).length) / 3)})
${data.features.openingName ? `OPENING: ${data.features.openingName}` : ""}
USER COLOR: ${data.userColor === "w" ? "White" : "Black"}
USER PLAYED: ${data.userMove}

ENGINE LINES (from before user's move, side to move = user):
${linesBlock || "(no lines)"}
USER MOVE EVAL DELTA: ${deltaCp} centipawns (negative = worse for user)
QUALITY (pre-classified): ${quality}

POSITION FEATURES:
- motifs: ${data.features.motifs.join(", ")}
- material balance (+ = white): ${data.features.materialBalance}
- hanging pieces: ${data.features.hangingPieces.length ? data.features.hangingPieces.map((h) => `${h.color}${h.piece}@${h.square}`).join(", ") : "none"}
${data.opponentBestReplySan ? `- opponent's best reply (engine): ${data.opponentBestReplySan}` : ""}
${data.threeMoveLineSan?.length ? `- forcing continuation: ${data.threeMoveLineSan.join(" ")}` : ""}

RELEVANT PRINCIPLES (use 0–1, weave in naturally):
${principlesBlock}

${data.recurringWeaknesses?.length ? `PLAYER'S RECURRING WEAKNESSES (reference subtly when relevant, don't lecture): ${data.recurringWeaknesses.join(", ")}` : ""}
${data.recentInsights?.length ? `RECENT COACHING POINTS (avoid repeating verbatim):\n- ${data.recentInsights.join("\n- ")}` : ""}
${data.recentHeadlines?.length ? `RECENT HEADLINES (do not restate; if relevant, reference as callback):\n- ${data.recentHeadlines.join("\n- ")}` : ""}

POSITION FEN: ${data.fenAfter}`;

    let parsed: any = null;
    try {
      const json = await callAI({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }, { timeoutMs: 12000 });
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = null;
    }

    return {
      quality,
      evalDelta: deltaCp,
      headline: parsed?.headline ?? (quality === "blunder" ? "A serious slip" : quality === "great" ? "A strong move" : "Move played"),
      narrative: parsed?.narrative ?? "The coach is catching up — try the next move.",
      threeMovesAhead: parsed?.threeMovesAhead ?? "",
      deepen: typeof parsed?.deepen === "string" ? parsed.deepen : "",
      captionedPlies: Array.isArray(parsed?.captionedPlies) ? parsed.captionedPlies.slice(0, 3).map((c: any) => ({
        san: String(c?.san ?? ""), caption: String(c?.caption ?? ""),
      })).filter((c: any) => c.san) : [],
      alternatives: Array.isArray(parsed?.alternatives) ? parsed.alternatives.slice(0, 3) : (betterMove ? [{ san: betterMove, why: "engine-preferred" }] : []),
      betterMove,
      referencedPrinciple: parsed?.referencedPrinciple ?? "",
      personaTone: parsed?.personaTone ?? moodFromQuality(quality),
      opponentThreats: data.opponentBestReplySan ? [data.opponentBestReplySan] : [],
    };
  });

function moodFromQuality(q: string): string {
  if (q === "brilliant") return "impressed";
  if (q === "great") return "pleased";
  if (q === "good") return "neutral";
  if (q === "inaccuracy") return "concerned";
  if (q === "mistake") return "concerned";
  if (q === "blunder") return "worried";
  return "neutral";
}

const chatSchema = z.object({
  fen: z.string(),
  pgn: z.string(),
  question: z.string().min(1).max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(20),
  topLines: z.array(z.object({ pvSan: z.array(z.string()), scoreCp: z.number().nullable(), mate: z.number().nullable() })).max(5).optional(),
});

export const chatAboutPosition = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => chatSchema.parse(d))
  .handler(async ({ data }) => {
    const linesBlock = data.topLines?.length
      ? "Engine top lines:\n" + data.topLines.map((l, i) =>
          `${i + 1}. ${l.pvSan.slice(0, 5).join(" ")} [${l.mate != null ? `mate ${l.mate}` : `${((l.scoreCp ?? 0) / 100).toFixed(2)}`}]`).join("\n")
      : "";
    const system = `You are a patient elite chess coach. You are GROUNDED in the engine's evaluation — never contradict it. Speak in concrete chess language: name squares, pieces, motifs. Use markdown lists when listing ideas.`;
    const user = `FEN: ${data.fen}
PGN: ${data.pgn}
${linesBlock}

Question: ${data.question}`;
    const json = await callAI({
      messages: [
        { role: "system", content: system },
        ...data.history,
        { role: "user", content: user },
      ],
    }, { timeoutMs: 20000 });
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
    evalDelta: z.number().optional(),
  })),
});

export const reviewGame = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data }) => {
    // Compute accuracy server-side from per-move evalDeltas (stable, not LLM-guessed).
    const userMoves = data.annotations;
    const accuracy = computeAccuracy(userMoves);
    const counts = userMoves.reduce<Record<string, number>>((a, m) => { a[m.quality] = (a[m.quality] || 0) + 1; return a; }, {});

    const system = `You are an elite chess coach delivering a post-game review. Be concrete, kind, and specific. Reference move numbers and motifs. Return JSON ONLY:
{
  "headline": "<one-sentence verdict>",
  "phases": { "opening": "<2 sentences>", "middlegame": "<2 sentences>", "endgame": "<2 sentences or 'Game ended before endgame.'>" },
  "keyMoments": ["Move N: <what happened, what to learn>", "..."],
  "strengths": ["<short>", "..."],
  "improvements": ["<concrete pattern to drill>", "..."],
  "studySuggestions": ["<topic / pattern>", "..."]
}`;
    const user = `User played: ${data.userColor === "w" ? "White" : "Black"}
Result: ${data.result}
Accuracy (computed): ${accuracy}%
Quality counts: ${JSON.stringify(counts)}
PGN: ${data.pgn}
Per-move qualities: ${JSON.stringify(userMoves)}`;
    let parsed: any = {};
    try {
      const json = await callAI({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }, { timeoutMs: 25000 });
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {}
    return {
      accuracy,
      headline: parsed.headline ?? "Game complete.",
      phases: parsed.phases ?? {},
      keyMoments: parsed.keyMoments ?? [],
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
      studySuggestions: parsed.studySuggestions ?? [],
    };
  });

function computeAccuracy(moves: { evalDelta?: number; quality: string }[]): number {
  if (moves.length === 0) return 100;
  let total = 0;
  for (const m of moves) {
    const d = Math.abs(m.evalDelta ?? qualityToDelta(m.quality));
    // Lichess-style accuracy curve approximation: 100 * exp(-0.004 * d)
    total += 100 * Math.exp(-0.004 * d);
  }
  return Math.round(total / moves.length);
}

function qualityToDelta(q: string): number {
  return ({ brilliant: 0, great: 5, good: 15, inaccuracy: 60, mistake: 140, blunder: 300 } as Record<string, number>)[q] ?? 30;
}

/** ElevenLabs TTS — returns base64 mp3. Voice fallback to "Charlie" (warm coach). */
const ttsSchema = z.object({
  text: z.string().min(1).max(2000),
  voiceId: z.string().default("IKne3meq5aSn9XLyUdCD"), // Charlie
});

export const speakText = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => ttsSchema.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY not configured");
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${data.voiceId}/stream?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.text,
          model_id: "eleven_turbo_v2_5",
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.35, use_speaker_boost: true, speed: 1.0 },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`TTS failed [${res.status}]: ${t.slice(0, 200)}`);
    }
    const buf = await res.arrayBuffer();
    return { audioBase64: Buffer.from(buf).toString("base64") };
  });
