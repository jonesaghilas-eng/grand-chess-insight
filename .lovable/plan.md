# Caïssa v4 — Memory, Review, Personality

Three coordinated waves. They share the same auth + DB foundation, so wave 1 lands first and the other two build on it.

---

## Wave 1 — Accounts & persistent cloud memory

Today, everything you teach Caïssa about your play lives in `localStorage` — wipe cookies, switch devices, switch browsers, it's gone. The coach has amnesia. We fix that.

**Auth surface**
- Google sign-in (Lovable broker) + email/password fallback.
- Top-right avatar pill: signed-out → "Sign in to remember"; signed-in → initial + menu (profile, sign out, export PGN).
- Playing while signed-out still works — memory just stays local. On sign-in, we offer "Import your local memory" (one-time merge).

**Database (Lovable Cloud)**
Four tables, all RLS-scoped to `auth.uid()`:
- `profiles` — display name, preferred difficulty, voice preference, avatar persona.
- `games` — pgn, result, user_color, difficulty, started_at, finished_at, opening_name, summary_json (the post-game review payload).
- `move_memory` — per-move learning points: motif tag, insight text, quality, weight, ply, game_id. This replaces `localStorage` for weaknesses/strengths/headlines.
- `coach_headlines` — last 6 headlines per user (for no-repeat across sessions, not just within one game).

**Server functions** (TanStack `createServerFn`, all auth-gated):
- `recordMoveMemory` — called from `coachUserMove` after each annotation.
- `getMemoryContext` — replaces `topWeaknesses/recentPoints/recentHeadlines` calls in `src/routes/index.tsx`. Returns the same shape so the coach prompt is unchanged.
- `saveGame` / `getGameHistory` — for the new review surface.

Memory degrades gracefully — when signed-out we still write to localStorage; when signed-in the cloud copy wins.

---

## Wave 2 — Post-game review, upgraded

Today's review is a single modal with text. We make it a real artifact.

**New review surface (`/review/$gameId` route + sheet from the play screen):**
- **Quality timeline** — horizontal sparkline across all your moves, colored by quality (green→amber→red). Click any dot to jump the board to that ply.
- **Theme grouping** — instead of a flat list, group by recurring motif: *"Hanging pieces — 3 moves (12, 18, 24)"*, *"Missed open files — 2 moves"*. Click a theme to step through just those moments.
- **Critical moment cards** — top 3 turning points with before/after eval, the move you played, the move the engine wanted, and a one-paragraph coach narrative.
- **Trend strip** — sparkline of your last 10 games' average centipawn loss (only visible when you have ≥3 games saved). The "are you getting better?" answer.
- **Shareable summary card** — generated image (1200×630) with verdict + key stat for sharing.

**Game history list** — `/games` route, simple table: date, opening, result, ACPL, "Open review". Cloud memory's payoff made visible.

---

## Wave 3 — Coach voice & personality polish

The coach speaks generically and the avatar only reacts in broad mood states. We sharpen both.

**Persona presets** (user-selectable in profile, default = mentor):
- *Mentor* — patient, encouraging, Nimzowitsch-style classical references. Current behavior.
- *Coach* — sharp, terse, GM-style. "That's a tempo. Don't waste it."
- *Storyteller* — narrative, lyrical, references famous games. "This is the same trap Spassky walked into in '69."

Each persona is a system-prompt block + a different ElevenLabs `voiceId`. Switching is instant — no rebuild of memory.

**Voice fixes**
- Stop on interrupt (already partially in `useSpeaker`, but the audio element sometimes stays alive on rapid moves — wire a proper `AbortController` and clear queued plays).
- Per-move-type pacing: blunders get a slower, lower delivery; brilliancies get an excited pitch shift. ElevenLabs `voice_settings` (stability/style) per quality bucket.
- "Tap to replay" on every coach card — uses cached audio when available so it doesn't re-bill the API.

**Avatar micro-reactions** (currently only switches mood on user's move):
- **Reacts on every move** — including AI's. Quick 200ms reaction state, then settles to base mood.
- **Distinct reactions**: capture → quick wince, check → eyes widen, blunder → head dip + eyebrow raise, brilliancy → smile + eye sparkle, time-eating think → slow blink loop.
- **Breathing always on** — currently the aura ring breathes but the avatar itself is static. Add a 4s subtle vertical drift (1–2px) on the SVG so it feels alive between moves.
- **Look-at-board** — eyes track the last-move square (left/right/center gaze offset based on file).

---

## Technical Section

**Order of operations** (each wave is independently shippable):

### Wave 1 — Auth + cloud memory
1. **Migration** — `profiles`, `games`, `move_memory`, `coach_headlines` with full RLS + GRANTs + `updated_at` triggers.
2. **Auth UI** — `/login` route with Google + email/password; `_authenticated` layout route is NOT used (we want playing-while-signed-out). Instead, a `useAuthOptional()` hook + `AuthMenu` component in the header.
3. **`supabase--configure_social_auth` with `["google"]`** — same turn as the broker integration.
4. **Server fns** in `src/lib/memory.functions.ts`: `recordMoveMemory`, `getMemoryContext`, `mergeLocalMemory`, `saveGame`, `getGameHistory`. All `.middleware([requireSupabaseAuth])`.
5. **`src/lib/memory.ts` refactor** — keep the same exported function shapes but add a cloud-first / localStorage-fallback layer. Callers in `src/routes/index.tsx` don't change.
6. **`attachSupabaseAuth`** — verify it's already wired in `src/start.ts` (it should be from the existing auth-attacher file).

### Wave 2 — Review
1. New route `src/routes/_authenticated/games.tsx` (history list) and `src/routes/_authenticated/games.$id.tsx` (deep review). Both call server fns that read `games` + `move_memory`.
2. `src/components/review/QualityTimeline.tsx` — SVG sparkline, click-to-jump (lifts state up via callback to a shared `<ReviewBoard />`).
3. `src/components/review/ThemeGroup.tsx`, `CriticalMomentCard.tsx`, `TrendStrip.tsx`.
4. `src/lib/review.functions.ts` — `generateDeepReview` (extends current `reviewGame` with theme grouping + critical-moment selection logic using existing Stockfish analysis cached during play).
5. Shareable card — server route `src/routes/api/og/$gameId.ts` returns a 1200×630 SVG (no native image libs — workerd-safe).
6. End-of-game flow in `src/routes/index.tsx`: replace `ReviewDialog` open with `navigate({ to: '/games/$id' })` for signed-in users; signed-out keeps the dialog.

### Wave 3 — Voice & personality
1. `src/lib/personas.ts` — three persona configs (system prompt fragment, voiceId, voice_settings, mood-mapping overrides).
2. `src/lib/coach.functions.ts` — accept `persona` in input, inject persona block into the LLM system prompt. Cache the result audio in IndexedDB keyed by `(text, voiceId)` for tap-to-replay.
3. `src/hooks/useSpeaker.tsx` — wire `AbortController`, clear pending plays on new move, expose `replay(audioId)`.
4. `src/components/chess/Avatar.tsx` — expand `AvatarMood` to include `reaction` states (`wince`, `widen`, `dip`, `sparkle`, `blink`), add the 4s breathing drift, add `lookAt` prop driven by last-move file. New SVG path variants for the reaction states (200ms hold then settle).
5. In `src/routes/index.tsx`, fire `setMood('wince')` etc. inside the AI-move effect using existing `features.motifs`. Currently only the user-move path sets nuanced moods.

**Files touched**

Wave 1:
- new: `src/routes/login.tsx`, `src/lib/memory.functions.ts`, `src/components/auth/AuthMenu.tsx`, `src/hooks/useAuthOptional.ts`
- edited: `src/routes/index.tsx`, `src/lib/memory.ts`, `src/routes/__root.tsx` (auth listener already there — verify)

Wave 2:
- new: `src/routes/_authenticated/games.tsx`, `src/routes/_authenticated/games.$id.tsx`, `src/routes/api/og/$gameId.ts`, `src/components/review/*` (4 files), `src/lib/review.functions.ts`
- edited: `src/routes/index.tsx` (post-game routing), `src/lib/coach.functions.ts` (extended review schema)

Wave 3:
- new: `src/lib/personas.ts`
- edited: `src/components/chess/Avatar.tsx`, `src/hooks/useSpeaker.tsx`, `src/lib/coach.functions.ts`, `src/routes/index.tsx`, `src/styles.css` (breathing keyframes)

**Out of scope**
- iOS native / Capacitor (already discussed and skipped).
- Engine/board changes (v3 just shipped those).
- Multiplayer.

**Verification**
- Sign in with Google, play a 10-move game, sign out, sign back in on a different browser → recurring weaknesses and recent headlines appear in the coach prompt.
- Finish a game → land on `/games/$id` with timeline + themes + critical moments.
- Switch persona to *Coach* → next move's voice + tone audibly different.
- Watch the avatar across 6 moves → it reacts on the AI's moves too, breathes between, eyes drift.
