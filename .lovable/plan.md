# Caïssa — next roadmap

You picked 7 features across two axes. Rather than ship them as one mega-PR, I'll sequence them into **3 phases** that each leave the app in a usable, demo-able state. You can stop after any phase.

---

## Phase 1 — Play & language (foundation everything else builds on)

Goal: make every game feel different, and let the coach speak your language.

### 1. Adjustable opponent strength + personalities
- Add a `Difficulty` control on the home screen: ELO slider (300–2800) + persona dropdown (`Balanced`, `Aggressive attacker`, `Solid positional`, `Tricky gambiteer`, `Endgame grinder`).
- Map ELO → Stockfish `Skill Level` (0–20) + `UCI_LimitStrength` / `UCI_Elo` options; map persona → multipv sampling bias (e.g. attacker picks from top-3 with weight toward sharper eval swings, positional prefers the move closest to top eval, gambiteer accepts -50cp for material imbalance).
- Persist last-used difficulty + persona to `profiles` (columns already exist for `preferred_difficulty`; add `preferred_persona`).
- Coach narrative gets a `vsPersona` hint so it can say things like "Against an attacker, you can't leave f7 unguarded."

### 2. Multilingual coach (Swedish first)
- Add `coach_language` to `profiles` (`en`, `sv`, `es`, `fr`, `de`, auto-detect from browser default).
- Pass language into `translateAnalysis`, `chatAboutPosition`, `reviewGame` system prompts ("Respond in Swedish.").
- TTS: pick voice per language (ElevenLabs multilingual model `eleven_multilingual_v2` already supports Swedish on Charlie; add a Swedish-native voice option).
- Language toggle in the header next to the voice button.

**Ship checkpoint:** you can play a tricky 1400 gambiteer in Swedish.

---

## Phase 2 — Learning loops (turn every game into training material)

### 3. Annotated PGN export + shareable game link
- Add a "Share game" button on the post-game review dialog.
- Server fn `exportAnnotatedPgn(gameId)` builds standard PGN with NAG codes (`?!`, `?`, `??`, `!`, `!!`) from each move's `quality`, and embeds the coach `headline` + `narrative` as `{ }` comments.
- Add public route `/g/:shareId` that loads a game by its short ID (new `share_id` text column on `games`, indexed, unique). Page replays the game move-by-move with the coach feed alongside — read-only, no auth.
- Copy-to-clipboard for both the PGN and the share URL.

### 4. Puzzle mode from your own blunders
- New route `/puzzles`. On load, query `move_memory` for the user's `quality IN ('mistake','blunder')` rows with `game_id` + `ply`.
- For each, replay the PGN up to that ply, present the position, ask the user to find the move *they should have played* (engine's top line from the original analysis — already stored in `summary_json` after Phase 2.1 below, or recomputed live with Stockfish).
- Score: correct on first try / hint used / failed. Persist attempts in new `puzzle_attempts` table so we can do spaced repetition (Leitner buckets) and resurface the motifs you keep missing.
- Group puzzles by motif tag (already extracted in `featureExtractor.ts`).

### 5. Progress dashboard across games
- Upgrade `/games` (currently a list) with a top dashboard:
  - Accuracy trend (line chart, last 20 games)
  - Motif mastery (radar: tactics / king safety / pawn structure / endgame / opening)
  - Recurring weaknesses (top 5 from `move_memory` aggregation, with trend arrows)
  - Total time, games played, win/loss/draw, average ACPL
- All powered by aggregating existing `games.acpl`, `games.summary_json`, and `move_memory` rows — no new schema beyond an index or two for speed.

**Ship checkpoint:** every game generates puzzles + a shareable link, and you can watch yourself improve.

---

## Phase 3 — Opening mastery + visual plans (deep coaching)

### 6. Opening trainer & repertoire
- New route `/openings`. Two tabs:
  - **Repertoire:** pick openings for white (e.g. London, Italian) and black (e.g. Caro-Kann, KID). Persisted to new `repertoire` table.
  - **Drill:** click an opening → Caïssa plays the main line; you guess each move. Wrong moves trigger coach explanation ("That's the Steinitz Variation — playable but loses tempo because…").
- Source: bundled JSON of ~50 main openings + variations (ECO codes A00–E99 short list). Each line has SAN moves + one-sentence "what this move accomplishes" caption.
- Spaced repetition on missed lines, same bucket logic as puzzles.
- Auto-detect opening from played games (already extracted by `featureExtractor`) and suggest "You played the French 4 times — want to drill it?"

### 7. Visual plan arrows (pawn breaks, piece routes)
- Extend the existing arrow/preview system on `Board.tsx` to render *plan* overlays in addition to threat/alternative previews:
  - **Pawn break targets:** yellow arrows from a pawn to its target break square (e.g. f2→f4 in a KID structure).
  - **Piece reroute paths:** blue dashed multi-segment arrows (e.g. Nb1→d2→f3→g5).
  - **Weak square overlay:** translucent red dot on holes in the opponent's structure (e.g. d5 in a Sicilian Najdorf).
- These are computed by a new `extractPlans(fen, phase)` heuristic + LLM polish (Gemini Flash, cached per FEN).
- Trigger: a new "Show plans" button next to the current "Show threats" preview, plus auto-triggered after the coach's `threeMovesAhead` line ("Here's what that looks like on the board").
- All overlays use existing animation primitives — same fade-in/scale-in already wired for `threatPreview`.

**Ship checkpoint:** Caïssa is a true coach — it shows you what to play, why, and how the position should evolve.

---

## Technical notes

- All new server fns follow the existing pattern in `src/lib/*.functions.ts` with `requireSupabaseAuth` middleware where user-scoped.
- New tables: `puzzle_attempts`, `repertoire`, and a `share_id` + indexes on `games`. Each migration includes the standard 4-step structure (CREATE → GRANT → RLS → POLICY).
- No edge functions — everything is TanStack server functions, consistent with the current architecture.
- The share route `/g/:shareId` is public (top-level route, no auth gate) and uses `supabaseAdmin` via a public server fn with explicit safe-column projection (no PII).
- All UI additions are additive — they don't touch the existing chat/board/coach feed flow on `/`.

---

## What I need from you

**Which phase do you want me to build first?** I'd recommend Phase 1 (small, high impact, and unlocks personality for everything later) — but happy to start anywhere. Or pick individual items à la carte if you'd rather not do a full phase.