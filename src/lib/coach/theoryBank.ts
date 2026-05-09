// Curated chess theory & didactic principles, retrieved by motif/phase/level
// and passed to the LLM translator as grounding. Not invented — distilled
// from canonical sources (Steinitz's elements, Capablanca's endgame rules,
// Nimzowitsch, Dvoretsky, Silman, and engine-era practical play).

export type Phase = "opening" | "middlegame" | "endgame";
export type Level = "beginner" | "intermediate" | "advanced" | "master";

export type Principle = {
  id: string;
  text: string;
  motifs: string[];           // tags that connect to extracted features
  phases: Phase[];
  minLevel: Level;            // lowest level it makes sense to mention
  source?: string;            // attribution shown subtly to the user
};

const L: Record<Level, number> = { beginner: 0, intermediate: 1, advanced: 2, master: 3 };

export const PRINCIPLES: Principle[] = [
  // Opening
  { id: "open-center",       text: "In the opening, fight for the centre with pawns or pieces — central control multiplies the activity of every piece.", motifs: ["opening","centre","development"], phases: ["opening"], minLevel: "beginner", source: "Steinitz" },
  { id: "open-develop",      text: "Develop knights before bishops, and don't move the same piece twice unless there's a concrete reason.", motifs: ["opening","development","tempo"], phases: ["opening"], minLevel: "beginner" },
  { id: "open-castle",       text: "Castle early. King safety is rarely a luxury and almost always the priority once development is underway.", motifs: ["opening","king-safety","castling"], phases: ["opening","middlegame"], minLevel: "beginner" },
  { id: "open-queen",        text: "Don't bring the queen out too early — she becomes a target for cheaper pieces and you lose tempi defending her.", motifs: ["opening","queen-out","tempo"], phases: ["opening"], minLevel: "beginner" },
  { id: "open-pawn-grab",    text: "A pawn in the opening costs roughly three tempi to win. If grabbing it lets the opponent develop with threats, the price is too high.", motifs: ["opening","pawn-grab","development"], phases: ["opening"], minLevel: "intermediate", source: "Tarrasch" },

  // Middlegame — strategy
  { id: "mid-weak-square",   text: "A square the opponent's pawns can never attack is a permanent home for your pieces — especially a knight on an outpost.", motifs: ["weak-square","outpost","knight"], phases: ["middlegame"], minLevel: "intermediate", source: "Nimzowitsch" },
  { id: "mid-prophylaxis",   text: "Before improving your own position, ask: what does my opponent want to do? Preventing their plan is often worth more than executing your own.", motifs: ["prophylaxis","plan"], phases: ["middlegame","endgame"], minLevel: "intermediate", source: "Nimzowitsch / Dvoretsky" },
  { id: "mid-bishop-pair",   text: "The bishop pair gains value as the position opens — keep the centre fluid and trade off a defender to unleash them.", motifs: ["bishop-pair","open-position"], phases: ["middlegame","endgame"], minLevel: "intermediate" },
  { id: "mid-bad-bishop",    text: "A bishop blocked behind its own pawns is bad — either trade it, redeploy via a long diagonal, or break the pawn chain.", motifs: ["bad-bishop","pawn-structure"], phases: ["middlegame","endgame"], minLevel: "intermediate" },
  { id: "mid-piece-activity",text: "In concrete positions, piece activity outweighs material. A passive extra piece is worth less than an active one.", motifs: ["activity","initiative"], phases: ["middlegame","endgame"], minLevel: "advanced" },
  { id: "mid-rook-7th",      text: "A rook on the 7th rank is worth a pawn on its own — it cuts off the king and pressures pawn-base squares.", motifs: ["rook","7th-rank"], phases: ["middlegame","endgame"], minLevel: "intermediate" },
  { id: "mid-open-file",     text: "Open and half-open files belong to the side that occupies them first with rooks; doubling rooks multiplies the pressure.", motifs: ["rook","open-file"], phases: ["middlegame"], minLevel: "intermediate" },

  // Middlegame — tactics
  { id: "tac-pin",           text: "A pinned piece can't move without exposing something more valuable behind it — pile up attackers on the pin.", motifs: ["pin"], phases: ["middlegame"], minLevel: "beginner" },
  { id: "tac-fork",          text: "Knights especially fork by attacking two pieces at once; look for unprotected pieces a knight's move apart from the king or queen.", motifs: ["fork","knight","loose-piece"], phases: ["opening","middlegame"], minLevel: "beginner" },
  { id: "tac-skewer",        text: "A skewer attacks a valuable piece, forcing it to move and exposing a less valuable one behind — the inverted pin.", motifs: ["skewer"], phases: ["middlegame","endgame"], minLevel: "beginner" },
  { id: "tac-discovered",    text: "Discovered attacks are the most violent tactic — moving one piece unleashes another, often gaining a tempo on a checking piece.", motifs: ["discovered-attack"], phases: ["middlegame"], minLevel: "intermediate" },
  { id: "tac-back-rank",     text: "If the king has no luft and the back rank is undefended, even a single rook or queen infiltration can mate.", motifs: ["back-rank","king-safety"], phases: ["middlegame","endgame"], minLevel: "beginner" },
  { id: "tac-loose",         text: "Loose pieces drop off — every undefended piece is a tactic waiting to happen. Count defenders before committing.", motifs: ["loose-piece","hanging"], phases: ["middlegame"], minLevel: "beginner", source: "John Nunn (LPDO)" },
  { id: "tac-overload",      text: "An overloaded defender can be overwhelmed by adding a second threat — give it two jobs and it fails one.", motifs: ["overload"], phases: ["middlegame"], minLevel: "intermediate" },
  { id: "tac-deflect",       text: "Deflection drags a key defender off its square; pair it with a sacrifice on the square it left.", motifs: ["deflection"], phases: ["middlegame"], minLevel: "intermediate" },

  // King safety / attacking
  { id: "att-open-files",    text: "When attacking the king, open lines toward it — pawn breaks (h4, g4, f5) and exchanges that clear files do most of the work.", motifs: ["king-attack","pawn-break"], phases: ["middlegame"], minLevel: "intermediate" },
  { id: "att-defenders",     text: "Count attackers vs. defenders around the king. If you have one more attacker than they have defenders, a sacrifice often breaks through.", motifs: ["king-attack","sacrifice"], phases: ["middlegame"], minLevel: "advanced" },
  { id: "att-greek",         text: "Bxh7+ followed by Ng5+ and Qh5 is the Greek Gift — works when the king has no escape on g8 and the f-pawn can't cover h7.", motifs: ["greek-gift","sacrifice"], phases: ["middlegame"], minLevel: "intermediate" },

  // Endgame
  { id: "end-king-active",   text: "In the endgame the king is a strong piece — centralise it as soon as queens come off.", motifs: ["king-activity","endgame"], phases: ["endgame"], minLevel: "beginner", source: "Capablanca" },
  { id: "end-passed",        text: "Passed pawns must be pushed — they tie down enemy pieces and become decisive on the 6th and 7th rank.", motifs: ["passed-pawn","endgame"], phases: ["middlegame","endgame"], minLevel: "beginner", source: "Nimzowitsch" },
  { id: "end-opposition",    text: "In king-and-pawn endings, the opposition (kings two squares apart, opponent to move) wins critical squares.", motifs: ["opposition","king-pawn-endgame"], phases: ["endgame"], minLevel: "intermediate" },
  { id: "end-rook-active",   text: "Rooks belong behind passed pawns — yours and theirs. A passive rook is the worst piece in the endgame.", motifs: ["rook","endgame","passed-pawn"], phases: ["endgame"], minLevel: "intermediate", source: "Tarrasch" },
  { id: "end-fortress",      text: "Sometimes a worse position is holdable as a fortress — set up a structure the opponent can't break, even with extra material.", motifs: ["fortress","defence","endgame"], phases: ["endgame"], minLevel: "advanced" },

  // Strategy / pawn structure
  { id: "str-isolani",       text: "An isolated queen pawn gives dynamic central play and outposts on c5/e5 — but becomes a target in the endgame.", motifs: ["isolani","pawn-structure"], phases: ["middlegame","endgame"], minLevel: "intermediate" },
  { id: "str-doubled",       text: "Doubled pawns aren't always weak — they can open files and control key squares. Judge by the squares they cover.", motifs: ["doubled-pawns","pawn-structure"], phases: ["middlegame"], minLevel: "intermediate" },
  { id: "str-minority",      text: "The minority attack (b4–b5 against c6) creates a permanent weakness on c6 or an isolated d-pawn — a textbook Carlsbad plan.", motifs: ["minority-attack","carlsbad"], phases: ["middlegame"], minLevel: "advanced" },
  { id: "str-space",         text: "Space gives you room to manoeuvre but doesn't win on its own — convert it by opening a file or creating a passed pawn.", motifs: ["space"], phases: ["middlegame"], minLevel: "intermediate" },

  // Engine-era / practical
  { id: "prac-concrete",     text: "Modern chess is concrete: when there's a forcing line, calculate it. General principles serve calculation, not the other way around.", motifs: ["calculation","forcing-line"], phases: ["opening","middlegame","endgame"], minLevel: "advanced" },
  { id: "prac-time-trouble", text: "Don't sacrifice without a clear follow-up. Speculative sacs work in blitz, lose in classical.", motifs: ["sacrifice","calculation"], phases: ["middlegame"], minLevel: "intermediate" },
  { id: "prac-trade",        text: "When ahead in material, simplify; when behind, keep pieces on and seek complications.", motifs: ["trade","material"], phases: ["middlegame","endgame"], minLevel: "beginner", source: "Capablanca" },
];

/** Retrieve up to `k` most relevant principles for the given context. */
export function retrievePrinciples(input: {
  motifs: string[];
  phase: Phase;
  level: Level;
  k?: number;
}): Principle[] {
  const { motifs, phase, level } = input;
  const k = input.k ?? 4;
  const motifSet = new Set(motifs);
  const userLevel = L[level];
  const scored = PRINCIPLES.map((p) => {
    if (!p.phases.includes(phase)) return { p, score: -Infinity };
    if (L[p.minLevel] > userLevel + 1) return { p, score: -Infinity };
    let score = 0;
    for (const m of p.motifs) if (motifSet.has(m)) score += 3;
    if (p.phases.length === 1 && p.phases[0] === phase) score += 1;
    return { p, score };
  }).filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored.map((x) => x.p);
}
