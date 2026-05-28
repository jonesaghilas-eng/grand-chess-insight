import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useServerFn } from "@tanstack/react-start";
import { translateAnalysis, reviewGame } from "@/lib/coach.functions";
import { Board } from "@/components/chess/Board";
import { MoveList, type Annotation } from "@/components/chess/MoveList";
import { EvalBar } from "@/components/chess/EvalBar";
import { ReviewDialog } from "@/components/chess/ReviewDialog";
import { LinesPanel, type DisplayLine } from "@/components/chess/LinesPanel";
import { UnifiedChat, type CoachFeedItem } from "@/components/chess/UnifiedChat";
import { type AvatarMood } from "@/components/chess/Avatar";
import { useEngine } from "@/hooks/useEngine";
import { useSpeaker } from "@/hooks/useSpeaker";
import { getEngine, type AnalysisResult } from "@/lib/engine/stockfish";
import { uciLineToSan, uciToSan } from "@/lib/engine/uciToSan";
import { extractFeatures } from "@/lib/coach/featureExtractor";
import { retrievePrinciples } from "@/lib/coach/theoryBank";
import { topWeaknesses, recentPoints, recordMove } from "@/lib/memory";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, RotateCcw, FlipVertical, BookOpen, Crown, BarChart3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caïssa — Pedagogical Chess Tutor (Stockfish 18)" },
      { name: "description", content: "Play Stockfish 18 live with a didactic AI coach that explains every move and shows you what could happen next." },
      { property: "og:title", content: "Caïssa — Pedagogical Chess Tutor" },
      { property: "og:description", content: "Stockfish-powered local engine, didactic translation, and a coach that breathes." },
    ],
  }),
  component: TutorPage,
});

type Difficulty = "beginner" | "intermediate" | "advanced" | "master";

const SKILL: Record<Difficulty, number> = { beginner: 3, intermediate: 8, advanced: 14, master: 20 };
const MOVETIME: Record<Difficulty, number> = { beginner: 250, intermediate: 600, advanced: 1100, master: 1600 };
const ANALYSIS_DEPTH = 16;
const THREAT_STEP_MS = 950;

function TutorPage() {
  const gameRef = useRef(new Chess());
  const [, force] = useState(0);
  const tick = () => force((n) => n + 1);

  const [userColor, setUserColor] = useState<"w" | "b">("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [feed, setFeed] = useState<CoachFeedItem[]>([]);
  const [viewPly, setViewPly] = useState(0);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [evalScore, setEvalScore] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [hoverArrow, setHoverArrow] = useState<{ from: string; to: string } | null>(null);
  const [threatArrow, setThreatArrow] = useState<{ from: string; to: string } | null>(null);
  const [mood, setMood] = useState<AvatarMood>("neutral");

  // Threat preview animation state
  const [threatPreview, setThreatPreview] = useState<{
    itemId: string; baseFen: string; moves: string[]; step: number;
  } | null>(null);
  const threatTimerRef = useRef<number | null>(null);

  const translateFn = useServerFn(translateAnalysis);
  const reviewFn = useServerFn(reviewGame);
  const speaker = useSpeaker();
  const engineState = useEngine();

  const game = gameRef.current;
  const totalPly = game.history().length;
  const isViewingHistory = viewPly !== 0 && viewPly !== totalPly;

  // Build the game we render. Threat preview overrides history view.
  const viewGame = useMemo(() => {
    if (threatPreview) {
      const g = new Chess(threatPreview.baseFen);
      for (let i = 0; i < threatPreview.step && i < threatPreview.moves.length; i++) {
        try { g.move(threatPreview.moves[i]); } catch { break; }
      }
      return g;
    }
    if (!isViewingHistory) return game;
    const g = new Chess();
    const hist = game.history();
    const upto = viewPly === 0 ? hist.length : viewPly;
    for (let i = 0; i < upto; i++) g.move(hist[i]);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, totalPly, isViewingHistory, threatPreview]);

  const displayedFen = viewGame.fen();
  const displayedPgn = viewGame.pgn();
  const isUsersTurn = game.turn() === userColor && !game.isGameOver();
  const isGameOver = game.isGameOver();

  // Engine analysis of displayed position (skipped during threat preview)
  const lastAnalyzedFenRef = useRef<string>("");
  useEffect(() => {
    if (!engineState.ready || threatPreview) return;
    if (lastAnalyzedFenRef.current === displayedFen) return;
    lastAnalyzedFenRef.current = displayedFen;
    setAnalysisLoading(true);
    setLines([]);
    let cancelled = false;
    (async () => {
      try {
        const eng = await getEngine();
        const res = await eng.analyze(displayedFen, { depth: ANALYSIS_DEPTH, multiPV: 5 });
        if (cancelled || lastAnalyzedFenRef.current !== displayedFen) return;
        const display: DisplayLine[] = res.lines.map((l) => ({
          rank: l.multipv,
          scoreCp: l.scoreCp,
          mate: l.mate,
          pvSan: uciLineToSan(displayedFen, l.pv),
        }));
        setLines(display);
        const top = res.lines[0];
        if (top) {
          const stm = displayedFen.split(" ")[1] as "w" | "b";
          const cp = top.mate != null ? (top.mate > 0 ? 1500 : -1500) : (top.scoreCp ?? 0);
          const fromWhite = stm === "w" ? cp : -cp;
          setEvalScore(Math.max(-1500, Math.min(1500, fromWhite)));
        }
      } catch (e: any) {
        if (!cancelled) toast.error(e?.message ?? "Engine analysis failed");
      } finally {
        if (!cancelled) setAnalysisLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [engineState.ready, displayedFen, threatPreview]);

  // AI move — also updates avatar to thinking, then a brief feed entry on play
  useEffect(() => {
    if (!engineState.ready || threatPreview) return;
    if (isGameOver) return;
    if (game.turn() === userColor) return;
    if (aiThinking) return;
    let cancelled = false;
    (async () => {
      setAiThinking(true);
      setMood("thinking");
      try {
        const eng = await getEngine();
        const fen = game.fen();
        const uci = await eng.bestMove(fen, { skillLevel: SKILL[difficulty], movetimeMs: MOVETIME[difficulty] });
        if (cancelled) return;
        if (!uci || uci === "(none)") return;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length >= 5 ? uci[4] : undefined;
        let move;
        try { move = game.move({ from, to, promotion: promo }); } catch { /* fallback below */ }
        if (!move) {
          const legal = game.moves();
          if (legal.length) move = game.move(legal[0]);
        }
        const newPly = game.history().length;
        const lastVerbose = game.history({ verbose: true }).slice(-1)[0];
        setAnnotations((prev) => [...prev, { ply: newPly, san: lastVerbose.san, color: lastVerbose.color }]);

        // Quick feature-extracted reaction (no LLM, low latency)
        const probe = new Chess(game.fen());
        const features = extractFeatures(probe, lastVerbose);
        const quip = buildOppQuip(features.motifs, lastVerbose.san);
        setFeed((p) => [...p, {
          id: `ai-${newPly}`,
          kind: "ai",
          ply: newPly,
          san: lastVerbose.san,
          text: quip,
        }]);
        // Mood: concerned if check/forcing, neutral otherwise
        setMood(features.motifs.includes("check") ? "concerned" : features.motifs.includes("capture") ? "concerned" : "neutral");
        setViewPly(0);
        tick();
      } catch (e: any) {
        toast.error(e?.message ?? "Engine move failed");
        setMood("neutral");
      } finally {
        if (!cancelled) setAiThinking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPly, userColor, isGameOver, engineState.ready]);

  // Trigger review on game over
  useEffect(() => {
    if (!isGameOver || reviewOpen || review) return;
    runReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameOver]);

  // Threat preview ticker
  useEffect(() => {
    if (!threatPreview) {
      if (threatTimerRef.current) { window.clearTimeout(threatTimerRef.current); threatTimerRef.current = null; }
      return;
    }
    if (threatPreview.step >= threatPreview.moves.length) {
      // Hold final frame, then auto-stop
      threatTimerRef.current = window.setTimeout(() => setThreatPreview(null), 1500);
      return () => { if (threatTimerRef.current) window.clearTimeout(threatTimerRef.current); };
    }
    threatTimerRef.current = window.setTimeout(() => {
      setThreatPreview((p) => p ? { ...p, step: p.step + 1 } : null);
    }, THREAT_STEP_MS);
    return () => { if (threatTimerRef.current) window.clearTimeout(threatTimerRef.current); };
  }, [threatPreview]);

  const onDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null }) => {
    if (!isUsersTurn || isViewingHistory || aiThinking || threatPreview) return false;
    if (!args.targetSquare) return false;
    const fenBefore = game.fen();
    let move;
    try {
      move = game.move({ from: args.sourceSquare, to: args.targetSquare, promotion: "q" });
    } catch { return false; }
    if (!move) return false;

    const newPly = game.history().length;
    const san = move.san;
    setAnnotations((prev) => [...prev, { ply: newPly, san, color: move.color }]);
    setViewPly(0);
    setThreatArrow(null);
    tick();

    void coachUserMove({ ply: newPly, san, fenBefore, fenAfter: game.fen(), color: move.color });
    return true;
  }, [isUsersTurn, isViewingHistory, aiThinking, threatPreview, game]);

  async function coachUserMove(input: { ply: number; san: string; fenBefore: string; fenAfter: string; color: "w" | "b" }) {
    setCoachLoading(true);
    setMood("thinking");
    try {
      const eng = await getEngine();
      const [before, after] = await Promise.all([
        eng.analyze(input.fenBefore, { depth: ANALYSIS_DEPTH, multiPV: 5 }),
        eng.analyze(input.fenAfter, { depth: Math.max(12, ANALYSIS_DEPTH - 2), multiPV: 1 }),
      ]);
      const afterTop = after.lines[0];

      const probe = new Chess(input.fenAfter);
      const features = extractFeatures(probe);
      const principles = retrievePrinciples({
        motifs: features.motifs, phase: features.phase, level: difficulty, k: 3,
      }).map((p) => ({ id: p.id, text: p.text, source: p.source }));

      const opponentBestUci = after.bestmove ?? afterTop?.pv?.[0];
      const opponentBestSan = opponentBestUci ? uciToSan(input.fenAfter, opponentBestUci) ?? undefined : undefined;
      const threeMoveLine = afterTop ? uciLineToSan(input.fenAfter, afterTop.pv.slice(0, 3)) : [];

      const topLines = before.lines.map((l) => ({
        multipv: l.multipv,
        scoreCp: l.scoreCp,
        mate: l.mate,
        pvSan: uciLineToSan(input.fenBefore, l.pv),
      }));

      const evalBeforeCp = before.lines[0]?.mate != null ? (before.lines[0]!.mate! > 0 ? 1500 : -1500) : (before.lines[0]?.scoreCp ?? 0);
      const evalAfterCp  = afterTop?.mate != null ? (afterTop.mate > 0 ? 1500 : -1500) : (afterTop?.scoreCp ?? 0);

      const result = await translateFn({
        data: {
          fenBefore: input.fenBefore,
          fenAfter: input.fenAfter,
          pgn: game.pgn(),
          userMove: input.san,
          userColor,
          evalBeforeCp,
          evalAfterCp,
          topLines,
          features: {
            phase: features.phase,
            motifs: features.motifs,
            hangingPieces: features.hangingPieces,
            materialBalance: features.materialBalance,
            openingName: features.openingName,
          },
          principles,
          level: difficulty,
          opponentBestReplySan: opponentBestSan,
          threeMoveLineSan: threeMoveLine,
          recurringWeaknesses: topWeaknesses(4),
          recentInsights: recentPoints(3).map((p) => p.insight),
        },
      });

      // Persist learning memory
      recordMove({
        quality: result.quality,
        motifs: features.motifs,
        insight: result.headline,
      });

      // Update move-list annotation
      setAnnotations((prev) => prev.map((x) => x.ply === input.ply ? {
        ...x, quality: result.quality, comment: result.headline,
      } : x));

      // Push to chat feed
      setFeed((p) => [...p, {
        id: `coach-${input.ply}`,
        kind: "coach",
        ply: input.ply,
        san: input.san,
        color: input.color,
        quality: result.quality,
        headline: result.headline,
        narrative: result.narrative,
        threeMovesAhead: result.threeMovesAhead,
        alternatives: result.alternatives,
        referencedPrinciple: result.referencedPrinciple,
        threatLineSan: threeMoveLine,
        threatFen: input.fenAfter,
      }]);

      if ((result.quality === "mistake" || result.quality === "blunder") && opponentBestUci) {
        setThreatArrow({ from: opponentBestUci.slice(0, 2), to: opponentBestUci.slice(2, 4) });
      } else {
        setThreatArrow(null);
      }

      setMood((result.personaTone as AvatarMood) ?? "neutral");

      if (speaker.enabled) {
        const speech = [result.headline, result.narrative].filter(Boolean).join(" ");
        speaker.speak(speech);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Coach unavailable");
      setMood("neutral");
    } finally {
      setCoachLoading(false);
    }
  }

  function reset(color: "w" | "b" = userColor) {
    gameRef.current = new Chess();
    setAnnotations([]);
    setFeed([]);
    setViewPly(0);
    setEvalScore(0);
    setReview(null);
    setLines([]);
    setThreatArrow(null);
    setThreatPreview(null);
    setMood("neutral");
    setUserColor(color);
    speaker.stop();
    tick();
  }
  function flipSides() { reset(userColor === "w" ? "b" : "w"); }

  function runReview() {
    setReviewOpen(true);
    setReviewLoading(true);
    setReview(null);
    const userMoveAnnots = annotations.filter((a) => a.color === userColor).map((a) => ({
      moveNumber: Math.ceil(a.ply / 2),
      san: a.san,
      quality: a.quality ?? "good",
    }));
    reviewFn({
      data: {
        pgn: game.pgn(),
        result: game.isCheckmate() ? (game.turn() === userColor ? "loss" : "win") : (game.isDraw() ? "draw" : "ongoing"),
        userColor,
        annotations: userMoveAnnots,
      },
    }).then(setReview).catch((e: any) => toast.error(e?.message)).finally(() => setReviewLoading(false));
  }

  function startThreatPreview(item: CoachFeedItem) {
    if (!item.threatFen || !item.threatLineSan?.length) return;
    setHoverArrow(null);
    setThreatPreview({ itemId: item.id, baseFen: item.threatFen, moves: item.threatLineSan.slice(0, 3), step: 0 });
    // step 0 will tick to 1 immediately via the timer effect
    setMood("worried");
  }
  function abortThreatPreview() { setThreatPreview(null); setMood("neutral"); }

  const orientation: "white" | "black" = userColor === "w" ? "white" : "black";

  const lastMoveSquares = useMemo(() => {
    const verbose = viewGame.history({ verbose: true });
    if (verbose.length === 0) return {};
    const last = verbose[verbose.length - 1];
    const isPreview = !!threatPreview;
    return {
      [last.from]: { background: isPreview ? "oklch(0.55 0.2 25 / 0.28)" : "oklch(0.78 0.12 80 / 0.32)" },
      [last.to]:   { background: isPreview ? "oklch(0.55 0.2 25 / 0.40)" : "oklch(0.78 0.12 80 / 0.42)" },
    } as Record<string, React.CSSProperties>;
  }, [viewGame, displayedFen, threatPreview]);

  const arrows = useMemo(() => {
    const out: { startSquare: string; endSquare: string; color: string }[] = [];
    if (threatPreview && threatPreview.step < threatPreview.moves.length) {
      // upcoming move arrow
      try {
        const probe = new Chess(threatPreview.baseFen);
        for (let i = 0; i < threatPreview.step; i++) probe.move(threatPreview.moves[i]);
        const next = threatPreview.moves[threatPreview.step];
        const m = probe.move(next);
        if (m) out.push({ startSquare: m.from, endSquare: m.to, color: "#c0392b" });
      } catch {}
      return out;
    }
    if (hoverArrow) out.push({ startSquare: hoverArrow.from, endSquare: hoverArrow.to, color: "#c9a84c" });
    else if (threatArrow && viewPly === 0) out.push({ startSquare: threatArrow.from, endSquare: threatArrow.to, color: "#c0392b" });
    return out;
  }, [hoverArrow, threatArrow, viewPly, threatPreview]);

  const handleLineHover = (l: DisplayLine | null) => {
    if (!l || !l.pvSan[0]) { setHoverArrow(null); return; }
    try {
      const probe = new Chess(displayedFen);
      const m = probe.move(l.pvSan[0]);
      if (m) setHoverArrow({ from: m.from, to: m.to });
    } catch { setHoverArrow(null); }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-background paper-grain overflow-hidden">
      {/* Slim header */}
      <header className="border-b border-border bg-card/70 backdrop-blur-md">
        <div className="max-w-[1500px] mx-auto px-4 lg:px-6 h-12 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <Crown className="h-4 w-4 text-accent shrink-0" />
            <h1 className="serif text-lg leading-none">Caïssa</h1>
            <span className="text-[9px] uppercase tracking-[0.22em] text-muted-foreground mono hidden md:inline">Stockfish 18 · live tutor</span>
            {!engineState.ready && !engineState.error && (
              <span className="text-[10px] mono text-muted-foreground italic">loading engine…</span>
            )}
            {engineState.error && <span className="text-[10px] mono text-destructive">engine error</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger className="w-[128px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="master">Master</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={flipSides} title="Switch sides"><FlipVertical className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => reset()} title="New game"><RotateCcw className="h-4 w-4" /></Button>
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" title="Engine lines & moves"><BarChart3 className="h-4 w-4" /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[360px] sm:w-[400px] p-4 flex flex-col gap-3">
                <SheetHeader><SheetTitle className="serif">Analysis</SheetTitle></SheetHeader>
                <LinesPanel lines={lines} loading={analysisLoading} onHover={handleLineHover}
                  sideToMove={(displayedFen.split(" ")[1] as "w" | "b") ?? "w"} />
                <div className="border border-border rounded-lg bg-card flex flex-col flex-1 min-h-0">
                  <div className="px-3 py-2 border-b border-border flex items-baseline justify-between">
                    <span className="serif text-sm">Moves</span>
                    <span className="mono text-[10px] text-muted-foreground">{totalPly} ply</span>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <MoveList annotations={annotations} currentPly={viewPly === 0 ? totalPly : viewPly}
                      onSelect={(p) => setViewPly(p === totalPly ? 0 : p)} />
                  </div>
                </div>
                <Button size="sm" onClick={runReview} disabled={annotations.length < 4}>
                  <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Game review
                </Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main split */}
      <main className="flex-1 min-h-0 max-w-[1500px] w-full mx-auto px-3 lg:px-6 py-3 lg:py-4 flex flex-col lg:flex-row gap-3 lg:gap-5">
        {/* Board column */}
        <div className="flex gap-2 lg:gap-3 items-start justify-center flex-shrink-0 lg:flex-1 lg:min-w-0">
          <EvalBar score={evalScore} />
          <div className="flex flex-col gap-2 w-full max-w-[min(85vh,640px)]">
            <PlayerLabel name={userColor === "w" ? "Stockfish · Black" : "Stockfish · White"} thinking={aiThinking} />
            <div className="relative">
              <Board
                position={displayedFen}
                orientation={orientation}
                onDrop={onDrop as any}
                arrows={arrows}
                highlightedSquares={lastMoveSquares}
                allowDragging={!isViewingHistory && isUsersTurn && !threatPreview}
              />
              {threatPreview && (
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-destructive/95 text-destructive-foreground text-xs mono uppercase tracking-widest shadow-lg animate-in fade-in slide-in-from-top-1">
                  <span>What could happen · {Math.min(threatPreview.step + 1, threatPreview.moves.length)}/{threatPreview.moves.length}</span>
                  <button onClick={abortThreatPreview} className="underline underline-offset-2">stop</button>
                </div>
              )}
            </div>
            <PlayerLabel name={userColor === "w" ? "You · White" : "You · Black"} thinking={false} you />
            <NavBar
              ply={viewPly === 0 ? totalPly : viewPly}
              total={totalPly}
              onJump={(p) => setViewPly(p === totalPly ? 0 : p)}
              status={statusText(game)}
            />
          </div>
        </div>

        {/* Chat column — always visible, sized to viewport */}
        <div className="flex-1 lg:flex-none lg:w-[420px] xl:w-[460px] min-h-0 flex">
          <div className="flex-1 min-h-[40vh] lg:min-h-0">
            <UnifiedChat
              feed={feed}
              mood={mood}
              speaking={speaker.speaking}
              voiceEnabled={speaker.enabled}
              onToggleVoice={() => speaker.setEnabled((v) => !v)}
              onSpeak={(t) => speaker.speak(t)}
              onPlayThreat={startThreatPreview}
              threatPlayingId={threatPreview?.itemId ?? null}
              onAbortThreat={abortThreatPreview}
              fen={displayedFen}
              pgn={displayedPgn}
              coachThinking={coachLoading}
            />
          </div>
        </div>
      </main>

      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} review={review} loading={reviewLoading} />
    </div>
  );
}

function PlayerLabel({ name, thinking, you }: { name: string; thinking: boolean; you?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-md text-xs ${you ? "bg-foreground text-background" : "bg-muted"}`}>
      <span className="serif text-[13px]">{name}</span>
      {thinking && <span className="italic mono opacity-70 text-[10px]">thinking…</span>}
    </div>
  );
}

function NavBar({ ply, total, onJump, status }: { ply: number; total: number; onJump: (p: number) => void; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-0.5">
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onJump(0)} disabled={ply === 0}>«</Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onJump(Math.max(0, ply - 1))} disabled={ply === 0}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="mono text-[11px] text-muted-foreground w-14 text-center">{ply}/{total}</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onJump(Math.min(total, ply + 1))} disabled={ply === total}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onJump(total)} disabled={ply === total}>»</Button>
      </div>
      <span className="text-[11px] italic font-serif text-muted-foreground truncate">{status}</span>
    </div>
  );
}

function statusText(g: Chess): string {
  if (g.isCheckmate()) return `Checkmate · ${g.turn() === "w" ? "Black" : "White"} wins`;
  if (g.isStalemate()) return "Stalemate · draw";
  if (g.isInsufficientMaterial()) return "Insufficient material · draw";
  if (g.isThreefoldRepetition()) return "Threefold repetition";
  if (g.isDraw()) return "Draw";
  if (g.inCheck()) return `${g.turn() === "w" ? "White" : "Black"} to move · check`;
  return `${g.turn() === "w" ? "White" : "Black"} to move`;
}

function buildOppQuip(motifs: string[], san: string): string {
  if (/[#]/.test(san)) return "mate.";
  if (/[+]/.test(san)) return "check — find a safe response.";
  if (motifs.includes("capture")) return "takes — recapture or improve a piece.";
  if (motifs.includes("castling")) return "castles — king tucked away.";
  if (motifs.includes("open-file")) return "eyeing an open file.";
  if (motifs.includes("development")) return "developing.";
  if (motifs.includes("passed-pawn")) return "watch the passed pawn.";
  return "your move.";
}
