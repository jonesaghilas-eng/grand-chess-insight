import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useServerFn } from "@tanstack/react-start";
import { translateAnalysis, reviewGame } from "@/lib/coach.functions";
import { Board } from "@/components/chess/Board";
import { MoveList, type Annotation } from "@/components/chess/MoveList";
import { EvalBar } from "@/components/chess/EvalBar";
import { CoachPanel, type CoachAnnotation } from "@/components/chess/CoachPanel";
import { PositionChat } from "@/components/chess/PositionChat";
import { ReviewDialog } from "@/components/chess/ReviewDialog";
import { LinesPanel, type DisplayLine } from "@/components/chess/LinesPanel";
import { Avatar, type AvatarMood } from "@/components/chess/Avatar";
import { useEngine } from "@/hooks/useEngine";
import { useSpeaker, VoiceToggle } from "@/hooks/useSpeaker";
import { getEngine, type AnalysisResult } from "@/lib/engine/stockfish";
import { uciLineToSan, uciToSan } from "@/lib/engine/uciToSan";
import { extractFeatures } from "@/lib/coach/featureExtractor";
import { retrievePrinciples } from "@/lib/coach/theoryBank";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, RotateCcw, FlipVertical, BookOpen, Crown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caïssa — Pedagogical Chess Tutor (Stockfish 18)" },
      { name: "description", content: "Play Stockfish 18 with a live didactic coach. Every move translated into elite chess pedagogy — threats, plans, principles, voice." },
      { property: "og:title", content: "Caïssa — Pedagogical Chess Tutor" },
      { property: "og:description", content: "Stockfish-powered local engine, didactic translation layer, and a coach that speaks." },
    ],
  }),
  component: TutorPage,
});

type Difficulty = "beginner" | "intermediate" | "advanced" | "master";

const SKILL: Record<Difficulty, number> = { beginner: 3, intermediate: 8, advanced: 14, master: 20 };
const MOVETIME: Record<Difficulty, number> = { beginner: 250, intermediate: 600, advanced: 1100, master: 1600 };
const ANALYSIS_DEPTH = 16;

function TutorPage() {
  const gameRef = useRef(new Chess());
  const [, force] = useState(0);
  const tick = () => force((n) => n + 1);

  const [userColor, setUserColor] = useState<"w" | "b">("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [perPlyAnnot, setPerPlyAnnot] = useState<Record<number, CoachAnnotation>>({});
  const [viewPly, setViewPly] = useState(0);
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiIntent, setAiIntent] = useState<string | undefined>();
  const [evalScore, setEvalScore] = useState(0); // centipawns from white POV
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [hoverArrow, setHoverArrow] = useState<{ from: string; to: string } | null>(null);
  const [threatArrow, setThreatArrow] = useState<{ from: string; to: string } | null>(null);
  const [mood, setMood] = useState<AvatarMood>("neutral");

  const translateFn = useServerFn(translateAnalysis);
  const reviewFn = useServerFn(reviewGame);
  const speaker = useSpeaker();
  const engineState = useEngine();

  const game = gameRef.current;
  const totalPly = game.history().length;
  const isViewingHistory = viewPly !== 0 && viewPly !== totalPly;

  const viewGame = useMemo(() => {
    if (!isViewingHistory) return game;
    const g = new Chess();
    const hist = game.history();
    const upto = viewPly === 0 ? hist.length : viewPly;
    for (let i = 0; i < upto; i++) g.move(hist[i]);
    return g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewPly, totalPly, isViewingHistory]);

  const displayedFen = viewGame.fen();
  const displayedPgn = viewGame.pgn();
  const isUsersTurn = game.turn() === userColor && !game.isGameOver();
  const isGameOver = game.isGameOver();

  // Run engine analysis for the displayed position (for the LinesPanel & coach)
  const lastAnalyzedFenRef = useRef<string>("");
  const lastAnalysisRef = useRef<AnalysisResult | null>(null);

  useEffect(() => {
    if (!engineState.ready) return;
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
        lastAnalysisRef.current = res;
        const display: DisplayLine[] = res.lines.map((l) => ({
          rank: l.multipv,
          scoreCp: l.scoreCp,
          mate: l.mate,
          pvSan: uciLineToSan(displayedFen, l.pv),
        }));
        setLines(display);
        // Update eval score (from white POV)
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
  }, [engineState.ready, displayedFen]);

  // AI's turn
  useEffect(() => {
    if (!engineState.ready) return;
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
        const move = game.move({ from, to, promotion: promo });
        if (!move) {
          // fallback to a random legal move
          const legal = game.moves();
          if (legal.length) game.move(legal[0]);
        }
        const newPly = game.history().length;
        const lastVerbose = game.history({ verbose: true }).slice(-1)[0];
        setAnnotations((prev) => [...prev, { ply: newPly, san: lastVerbose.san, color: lastVerbose.color }]);
        setAiIntent(`Stockfish (skill ${SKILL[difficulty]}) plays ${lastVerbose.san}.`);
        setMood("neutral");
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

  const onDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null }) => {
    if (!isUsersTurn || isViewingHistory || aiThinking) return false;
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
    setAiIntent(undefined);
    setViewPly(0);
    setThreatArrow(null);
    tick();

    void coachUserMove({ ply: newPly, san, fenBefore, fenAfter: game.fen() });
    return true;
  }, [isUsersTurn, isViewingHistory, aiThinking, game]);

  async function coachUserMove(input: { ply: number; san: string; fenBefore: string; fenAfter: string }) {
    setCoachLoading(true);
    setMood("thinking");
    try {
      const eng = await getEngine();
      const [before, after] = await Promise.all([
        eng.analyze(input.fenBefore, { depth: ANALYSIS_DEPTH, multiPV: 5 }),
        eng.analyze(input.fenAfter, { depth: Math.max(12, ANALYSIS_DEPTH - 2), multiPV: 1 }),
      ]);
      const beforeTop = before.lines[0];
      const afterTop = after.lines[0];

      const evalBeforeCp = beforeTop?.mate != null ? (beforeTop.mate > 0 ? 1500 : -1500) : (beforeTop?.scoreCp ?? 0);
      const evalAfterCp = afterTop?.mate != null ? (afterTop.mate > 0 ? 1500 : -1500) : (afterTop?.scoreCp ?? 0);

      const probe = new Chess(input.fenAfter);
      const features = extractFeatures(probe);
      const principles = retrievePrinciples({
        motifs: features.motifs,
        phase: features.phase,
        level: difficulty,
        k: 3,
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
        },
      });

      setPerPlyAnnot((prev) => ({ ...prev, [input.ply]: result }));
      setAnnotations((prev) => prev.map((x) => x.ply === input.ply ? {
        ...x,
        quality: result.quality,
        comment: result.headline,
      } : x));

      // Threat arrow if move was bad
      if ((result.quality === "mistake" || result.quality === "blunder") && opponentBestUci) {
        setThreatArrow({ from: opponentBestUci.slice(0, 2), to: opponentBestUci.slice(2, 4) });
      } else {
        setThreatArrow(null);
      }

      setMood((result.personaTone as AvatarMood) ?? "neutral");

      // Speak if voice on
      if (speaker.enabled) {
        const speech = [result.headline, result.narrative, result.threeMovesAhead].filter(Boolean).join(" ");
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
    setPerPlyAnnot({});
    setViewPly(0);
    setAiIntent(undefined);
    setEvalScore(0);
    setReview(null);
    setLines([]);
    setThreatArrow(null);
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
      evalDelta: perPlyAnnot[a.ply]?.evalDelta,
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

  const currentAnnot: CoachAnnotation | null = useMemo(() => {
    if (viewPly === 0) {
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (annotations[i].color === userColor && perPlyAnnot[annotations[i].ply]) return perPlyAnnot[annotations[i].ply];
      }
      return null;
    }
    return perPlyAnnot[viewPly] ?? null;
  }, [viewPly, annotations, userColor, perPlyAnnot]);

  const orientation: "white" | "black" = userColor === "w" ? "white" : "black";

  const lastMoveSquares = useMemo(() => {
    const verbose = viewGame.history({ verbose: true });
    if (verbose.length === 0) return {};
    const last = verbose[verbose.length - 1];
    return {
      [last.from]: { background: "oklch(0.78 0.12 80 / 0.32)" },
      [last.to]:   { background: "oklch(0.78 0.12 80 / 0.42)" },
    } as Record<string, React.CSSProperties>;
  }, [viewGame, displayedFen]);

  const arrows = useMemo(() => {
    const out: { startSquare: string; endSquare: string; color: string }[] = [];
    if (hoverArrow) out.push({ startSquare: hoverArrow.from, endSquare: hoverArrow.to, color: "#c9a84c" });
    else if (threatArrow && viewPly === 0) out.push({ startSquare: threatArrow.from, endSquare: threatArrow.to, color: "#c0392b" });
    else if (currentAnnot?.betterMove && viewPly !== 0) {
      try {
        const probe = new Chess(viewGame.fen());
        const m = probe.move(currentAnnot.betterMove);
        if (m) out.push({ startSquare: m.from, endSquare: m.to, color: "#c9a84c" });
      } catch {}
    }
    return out;
  }, [hoverArrow, threatArrow, currentAnnot, viewGame, viewPly]);

  const handleLineHover = (l: DisplayLine | null) => {
    if (!l || !l.pvSan[0]) { setHoverArrow(null); return; }
    try {
      const probe = new Chess(displayedFen);
      const m = probe.move(l.pvSan[0]);
      if (m) setHoverArrow({ from: m.from, to: m.to });
    } catch { setHoverArrow(null); }
  };

  return (
    <div className="min-h-screen bg-background paper-grain">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-accent" />
            <h1 className="serif text-2xl">Caïssa</h1>
            <span className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground mono hidden sm:inline">
              Stockfish 18 · Didactic Tutor
            </span>
            {!engineState.ready && !engineState.error && (
              <span className="text-[10px] mono text-muted-foreground italic">loading engine…</span>
            )}
            {engineState.error && (
              <span className="text-[10px] mono text-destructive">engine error</span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner · skill 3</SelectItem>
                <SelectItem value="intermediate">Intermediate · skill 8</SelectItem>
                <SelectItem value="advanced">Advanced · skill 14</SelectItem>
                <SelectItem value="master">Master · skill 20</SelectItem>
              </SelectContent>
            </Select>
            <VoiceToggle enabled={speaker.enabled} onToggle={() => speaker.setEnabled((v) => !v)} speaking={speaker.speaking} />
            <Button variant="outline" size="sm" onClick={flipSides}>
              <FlipVertical className="h-4 w-4 mr-1" /> Switch
            </Button>
            <Button variant="outline" size="sm" onClick={() => reset()}>
              <RotateCcw className="h-4 w-4 mr-1" /> New
            </Button>
            <Button size="sm" onClick={runReview} disabled={annotations.length < 4}>
              <BookOpen className="h-4 w-4 mr-1" /> Review
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 lg:px-6 py-5 grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_380px] gap-5">
        {/* Eval + board */}
        <div className="flex gap-3 items-start justify-center">
          <EvalBar score={evalScore} />
          <div className="flex flex-col gap-3">
            <PlayerLabel name={userColor === "w" ? "Black · Stockfish" : "White · Stockfish"} thinking={aiThinking} />
            <div className="w-full max-w-[560px]">
              <Board
                position={displayedFen}
                orientation={orientation}
                onDrop={onDrop as any}
                arrows={arrows}
                highlightedSquares={lastMoveSquares}
                allowDragging={!isViewingHistory && isUsersTurn}
              />
            </div>
            <PlayerLabel name={userColor === "w" ? "White · You" : "Black · You"} thinking={false} you />
            <NavBar
              ply={viewPly === 0 ? totalPly : viewPly}
              total={totalPly}
              onJump={(p) => setViewPly(p === totalPly ? 0 : p)}
              status={statusText(game)}
            />
          </div>
        </div>

        {/* Center: moves + lines */}
        <div className="flex flex-col gap-4 min-h-0">
          <LinesPanel
            lines={lines}
            loading={analysisLoading}
            onHover={handleLineHover}
            sideToMove={(displayedFen.split(" ")[1] as "w" | "b") ?? "w"}
          />
          <div className="border border-border rounded-lg bg-card ink-shadow flex flex-col flex-1 min-h-[260px] max-h-[420px]">
            <div className="px-3 py-2 border-b border-border flex items-baseline justify-between">
              <span className="serif text-base">Moves</span>
              <span className="mono text-[10px] text-muted-foreground">{totalPly} ply</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <MoveList
                annotations={annotations}
                currentPly={viewPly === 0 ? totalPly : viewPly}
                onSelect={(p) => setViewPly(p === totalPly ? 0 : p)}
              />
            </div>
          </div>
        </div>

        {/* Right: avatar + coach + chat */}
        <div className="flex flex-col gap-4">
          <div className="border border-border rounded-lg bg-card ink-shadow p-4 flex items-center gap-4">
            <Avatar mood={mood} speaking={speaker.speaking} size={88} />
            <div className="flex-1 text-xs text-muted-foreground italic font-serif leading-relaxed">
              {speaker.enabled ? "Voice is on — coach will speak each move." : "Click the speaker icon to let the coach talk."}
            </div>
          </div>
          <div className="border border-border rounded-lg bg-card ink-shadow flex flex-col min-h-[360px] max-h-[560px]">
            <Tabs defaultValue="coach" className="flex-1 flex flex-col">
              <TabsList className="m-2 grid grid-cols-2">
                <TabsTrigger value="coach">Coach</TabsTrigger>
                <TabsTrigger value="chat">Ask</TabsTrigger>
              </TabsList>
              <TabsContent value="coach" className="flex-1 overflow-y-auto m-0 p-0">
                <CoachPanel
                  annotation={currentAnnot}
                  loading={coachLoading && viewPly === 0}
                  aiIntent={aiIntent}
                  onSpeak={(t) => speaker.speak(t)}
                  voiceOn={speaker.enabled}
                />
              </TabsContent>
              <TabsContent value="chat" className="flex-1 m-0 p-0 overflow-hidden">
                <PositionChat fen={displayedFen} pgn={displayedPgn} />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>

      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} review={review} loading={reviewLoading} />
    </div>
  );
}

function PlayerLabel({ name, thinking, you }: { name: string; thinking: boolean; you?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded ${you ? "bg-foreground text-background" : "bg-muted"}`}>
      <span className="serif text-sm">{name}</span>
      {thinking && <span className="text-xs italic mono opacity-70">thinking…</span>}
    </div>
  );
}

function NavBar({ ply, total, onJump, status }: { ply: number; total: number; onJump: (p: number) => void; status: string }) {
  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={() => onJump(0)} disabled={ply === 0}>«</Button>
        <Button size="icon" variant="ghost" onClick={() => onJump(Math.max(0, ply - 1))} disabled={ply === 0}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="mono text-xs text-muted-foreground w-16 text-center">{ply} / {total}</span>
        <Button size="icon" variant="ghost" onClick={() => onJump(Math.min(total, ply + 1))} disabled={ply === total}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onJump(total)} disabled={ply === total}>»</Button>
      </div>
      <span className="text-xs italic font-serif text-muted-foreground truncate">{status}</span>
    </div>
  );
}

function statusText(g: Chess): string {
  if (g.isCheckmate()) return `Checkmate · ${g.turn() === "w" ? "Black" : "White"} wins`;
  if (g.isStalemate()) return "Stalemate · draw";
  if (g.isInsufficientMaterial()) return "Insufficient material · draw";
  if (g.isThreefoldRepetition()) return "Threefold repetition";
  if (g.isDraw()) return "Draw";
  if (g.inCheck()) return `${g.turn() === "w" ? "White" : "Black"} to move · in check`;
  return `${g.turn() === "w" ? "White" : "Black"} to move`;
}
