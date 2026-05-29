# Caïssa v3 — Refined Surface, Sharper Coach, Stable Engine

The current build hides its best ideas. At 785px the chat collapses *below* the board, the board itself looks like a generic chess.com clone, analysis lives behind a sheet, and the coach repeats itself. Three coordinated fixes.

---

## 1. Visual polish & layout (the headline change)

**The split goes side-by-side at every breakpoint ≥720px**, not 1024px. Below that, a tabbed surface (Board / Coach) instead of a vertical stack — you should never have to scroll past the board to see the chat.

**Board surface — Awwwards-grade, not generic:**
- New board palette: warm ivory + walnut (`oklch(0.94 0.018 80)` / `oklch(0.42 0.045 50)`) instead of the current muddy brown — feels like a real wood set, not a web demo.
- Soft inner shadow + 1px gold rule around the board for that "framed object on paper" feel.
- Coordinates inside the squares replaced with subtle outer rank/file labels in `mono` at 9px — board reads clean.
- Last-move highlight gets a translucent gold *underlay* instead of a flat tint, with a 200ms `scale-in` so the move *lands*.
- Piece drag uses a subtle scale(1.08) + drop shadow on lift; squares glow on legal-target hover.
- Eval bar redesigned: thin (8px), full-board height, gradient fill with a 300ms tweened transition on every engine update, numeric centipawn floats on hover.

**Chat panel — visible, calm, focused:**
- Avatar moves to a sticky 64px header with a soft breathing aura ring (radial gradient, opacity 0.3→0.6 at 4s loop).
- Mood transitions animate (300ms crossfade between SVG states) — right now they snap.
- Coach annotations get a refined card: quality dot becomes a small ribbon down the left edge (color = severity), headline in serif italic, narrative in sans — magazine layout, not a chat bubble.
- Threat-preview button gets a real cinematic affordance: red play triangle in a circle, hover scales the whole row, "watch what could happen" feels like pressing play on a clip.
- Composer pinned at bottom, never scrolls off — proper sticky footer with backdrop blur.

**Header:** drop the engine-status text into a tiny status dot next to the crown (green/amber/red). Reclaim the horizontal space for a *visible* "Game review" button when there are enough moves, instead of burying it in the sheet.

**Analysis surface:** the Lines panel moves *out* of the sheet and into a collapsible third column on ≥1280px (board · coach · lines). Below 1280px it stays in the sheet — but the sheet trigger gets a clearer label ("Engine · 5 lines") and shows a tiny live eval delta.

**Motion register:** every state change (move played, mood shift, threat preview start/stop, eval change) uses a consistent 200–300ms ease-out. No snaps.

---

## 2. Coaching intelligence (the sharper voice)

**Stop repeating itself.** Track the last 6 coaching points; the LLM prompt now receives them with a hard rule: *do not restate, build on them*. Right now "develop your knight" can fire three turns in a row.

**Three-layer narrative depth:**
1. **Verdict** (one phrase) — always shown.
2. **Why** (1–2 sentences) — always shown.
3. **Deepen** — collapsed "Read more" reveals: positional assessment, the principle's source (Nimzowitsch *My System* p.84 style), and the *full* 3-ply punishment line in algebraic with brief move-by-move gloss. This is where the chess theory you asked for lives — surfaced on demand, not crammed into every card.

**Better threat translation.** Currently the 3-move-ahead line is just SAN. New: each ply in the preview shows a one-line caption ("…and now the d-file is yours — that's why c5 was the wrong moment"). Generated once at coaching time, replayed as captions during the animated preview.

**Memory that actually steers.** Today `recurringWeaknesses` is passed in but rarely surfaces. New rule in the prompt: when a recurring weakness re-appears in the position, the coach must reference it explicitly *as a callback* ("same shape as move 11 — hanging piece on a half-open file"). This is what makes it feel like a tutor across games, not a fresh annotator each move.

**Opening name** is extracted but not shown. Surface it as a faint chip below the player label for the first 10 plies.

---

## 3. Performance & stability (so a full game actually finishes)

The current build can stall mid-game. Root causes and fixes:

- **Engine analysis queue collisions** — when you move fast, the analysis effect can fire before the previous `analyze()` resolves. Add a sequence-number guard inside `getEngine()` so a newer request *cancels* the in-flight UCI `go` (send `stop`, await `bestmove`, then start the new one). Today it just races.
- **Coach translation in parallel with AI move** — the LLM call for coaching can take 8s and overlaps the AI's `bestmove`, doubling pressure on the worker thread. Decouple: AI move uses a separate engine instance (or shares with strict serialization), and coaching analysis runs at lower depth (12) during AI's turn, deepening to 16 only after.
- **Memory growth in long games** — `feed` and `annotations` arrays grow unbounded and re-render the whole ScrollArea on every push. Virtualize the feed (only render last 30 items inline, older collapsed under "Earlier in this game").
- **Stockfish init race on slow networks** — `useEngine` reports `ready` before the WASM is fully primed for `setoption`. Add a real `isready`/`readyok` handshake before resolving.
- **Lost moves on tab blur** — Web Worker keeps running but `setTimeout`-based threat preview pauses. Switch threat-preview ticker to `requestAnimationFrame` with a visibility check.
- **Voice synthesis** doesn't get cancelled when a new move arrives. Cancel pending `speak()` and abort the audio element on every new coach annotation.

After this: a 60-move game should finish with no engine hiccups, the coach stays caught up, and nothing accumulates.

---

## Technical Section

**Files to edit:**
- `src/routes/index.tsx` — layout grid (board · coach · optional lines), responsive breakpoints, engine analysis sequencing, AbortController plumbing.
- `src/components/chess/Board.tsx` — palette tokens, square highlight underlay, drag animation, outer coordinates.
- `src/components/chess/UnifiedChat.tsx` — sticky avatar header w/ aura, ribbon-style coach card, sticky composer, collapsible "Read more", feed virtualization.
- `src/components/chess/Avatar.tsx` — 300ms mood crossfade, breathing aura.
- `src/components/chess/EvalBar.tsx` — thin gradient with tweened fill + hover readout.
- `src/components/chess/LinesPanel.tsx` — compact third-column variant.
- `src/lib/engine/stockfish.ts` — cancellation/serialization, real readyok handshake.
- `src/lib/coach.functions.ts` — extended JSON schema (`deepen`, `captionedPlies`, `openingChip`), no-repeat rule, callback-to-memory rule.
- `src/hooks/useSpeaker.tsx` — cancel-on-new behavior.
- `src/styles.css` — board palette tokens, aura keyframes, mood crossfade utility.

**Out of scope (call out so we don't drift):**
- No new features (translation engine, mic upgrades, Supabase memory) — those land after this is solid.
- No engine swap — staying on Stockfish 18 lite WASM.
- No business-logic / DB work.

**Verification:** screenshot at 785px (your viewport), 1024px, 1440px after the change; play a 30-move game end-to-end watching for stalls; confirm the coach never repeats the same headline twice in a 6-move window.
