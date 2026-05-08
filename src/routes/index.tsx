import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { useServerFn } from "@tanstack/react-start";
import { getAIMove, annotateMove, reviewGame } from "@/lib/coach.functions";
import { Board } from "@/components/chess/Board";
import { MoveList, type Annotation } from "@/components/chess/MoveList";
import { EvalBar } from "@/components/chess/EvalBar";
import { CoachPanel } from "@/components/chess/CoachPanel";
import { PositionChat } from "@/components/chess/PositionChat";
import { ReviewDialog } from "@/components/chess/ReviewDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, RotateCcw, FlipVertical, BookOpen, Crown } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Caissa — A Pedagogical Chess Tutor" },
      { name: "description", content: "Play chess against an AI coach that explains every move, threat, and plan in plain language. Get a full GM-style review of your game." },
      { property: "og:title", content: "Caissa — Pedagogical Chess Tutor" },
      { property: "og:description", content: "Learn chess by playing. AI commentary, threat detection, and a full post-game review." },
    ],
  }),
  component: TutorPage,
});

type Difficulty = "beginner" | "intermediate" | "advanced" | "master";

type Annot = Annotation & {
  betterMove?: string;
  betterIdea?: string;
  opponentThreats?: string[];
  plan?: string;
  evalDelta?: number;
};

function TutorPage() {
  const gameRef = useRef(new Chess());
  const [, force] = useState(0);
  const tick = () => force((n) => n + 1);

  const [userColor, setUserColor] = useState<"w" | "b">("w");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [annotations, setAnnotations] = useState<Annot[]>([]);
  const [viewPly, setViewPly] = useState(0); // 0 = current
  const [coachLoading, setCoachLoading] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiIntent, setAiIntent] = useState<string | undefined>();
  const [evalScore, setEvalScore] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const aiMoveFn = useServerFn(getAIMove);
  const annotateFn = useServerFn(annotateMove);
  const reviewFn = useServerFn(reviewGame);

  const game = gameRef.current;
  const totalPly = game.history().length;
  const isViewingHistory = viewPly !== 0 && viewPly !== totalPly;

  // Build a chess instance reflecting the viewed ply
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

  // AI's turn
  useEffect(() => {
    if (isGameOver) return;
    if (game.turn() === userColor) return;
    if (aiThinking) return;
    let cancelled = false;
    (async () => {
      setAiThinking(true);
      try {
        const legal = game.moves();
        const res = await aiMoveFn({ data: {
          fen: game.fen(),
          pgn: game.pgn(),
          legalMoves: legal,
          userColor,
          difficulty,
        }});
        if (cancelled) return;
        const move = game.move(res.move);
        if (!move) {
          // shouldn't happen — fallback to a random legal move
          game.move(legal[0]);
        }
        setAnnotations((prev) => [
          ...prev,
          { ply: game.history().length, san: game.history().slice(-1)[0], color: game.history({ verbose: true }).slice(-1)[0].color },
        ]);
        setAiIntent(res.intent);
        setViewPly(0);
        tick();
      } catch (e: any) {
        toast.error(e.message ?? "AI failed to move");
      } finally {
        if (!cancelled) setAiThinking(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPly, userColor, isGameOver]);

  // Trigger review automatically on game over
  useEffect(() => {
    if (!isGameOver || reviewOpen || review) return;
    runReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameOver]);

  const onDrop = useCallback((args: { sourceSquare: string; targetSquare: string | null; piece: any }) => {
    if (!isUsersTurn || isViewingHistory || aiThinking) return false;
    if (!args.targetSquare) return false;
    const fenBefore = game.fen();
    const legalBefore = game.moves();
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
    tick();

    // Annotate in background
    setCoachLoading(true);
    annotateFn({ data: {
      fenBefore,
      fenAfter: game.fen(),
      pgn: game.pgn(),
      userMove: san,
      userColor,
      legalMovesBefore: legalBefore,
    }}).then((a) => {
      setAnnotations((prev) => prev.map((x) => x.ply === newPly ? {
        ...x,
        quality: a.quality,
        comment: a.comment,
        betterMove: a.betterMove,
        betterIdea: a.betterIdea,
        opponentThreats: a.opponentThreats,
        plan: a.plan,
        evalDelta: a.evalDelta,
      } : x));
      setEvalScore((prev) => {
        const sign = userColor === "w" ? 1 : -1;
        return Math.max(-1500, Math.min(1500, prev + sign * (a.evalDelta ?? 0)));
      });
    }).catch((e) => {
      toast.error(e.message ?? "Coach unavailable");
    }).finally(() => setCoachLoading(false));

    return true;
  }, [isUsersTurn, isViewingHistory, aiThinking, userColor, annotateFn, game]);

  function reset(color: "w" | "b" = userColor) {
    gameRef.current = new Chess();
    setAnnotations([]);
    setViewPly(0);
    setAiIntent(undefined);
    setEvalScore(0);
    setReview(null);
    setUserColor(color);
    tick();
  }

  function flipSides() {
    reset(userColor === "w" ? "b" : "w");
  }

  function runReview() {
    setReviewOpen(true);
    setReviewLoading(true);
    setReview(null);
    reviewFn({ data: {
      pgn: game.pgn(),
      result: game.isCheckmate() ? (game.turn() === userColor ? "loss" : "win") : (game.isDraw() ? "draw" : "ongoing"),
      userColor,
      annotations: annotations.filter((a) => a.color === userColor).map((a) => ({
        moveNumber: Math.ceil(a.ply / 2),
        san: a.san,
        quality: a.quality ?? "good",
      })),
    }}).then(setReview).catch((e) => toast.error(e.message)).finally(() => setReviewLoading(false));
  }

  const currentAnnot = useMemo(() => {
    if (viewPly === 0) {
      // last user move
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (annotations[i].color === userColor) return annotations[i];
      }
      return null;
    }
    return annotations.find((a) => a.ply === viewPly) ?? null;
  }, [viewPly, annotations, userColor]);

  const orientation: "white" | "black" = userColor === "w" ? "white" : "black";
  const lastMoveSquares = useMemo(() => {
    const verbose = viewGame.history({ verbose: true });
    if (verbose.length === 0) return {};
    const last = verbose[verbose.length - 1];
    return {
      [last.from]: { background: "oklch(0.78 0.12 80 / 0.35)" },
      [last.to]: { background: "oklch(0.78 0.12 80 / 0.45)" },
    } as Record<string, React.CSSProperties>;
  }, [viewGame, displayedFen]);

  const arrows = useMemo(() => {
    if (!currentAnnot?.betterMove || viewPly === 0) return [];
    try {
      const probe = new Chess(viewGame.fen());
      const m = probe.move(currentAnnot.betterMove);
      if (!m) return [];
      return [{ startSquare: m.from, endSquare: m.to, color: "var(--color-gold)" }];
    } catch { return []; }
  }, [currentAnnot, viewGame, viewPly]);

  return (
    <div className="min-h-screen bg-background paper-grain">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-accent" />
            <h1 className="serif text-2xl">Caissa</h1>
            <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground mono hidden sm:inline">
              Pedagogical Chess Tutor
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner · 1000</SelectItem>
                <SelectItem value="intermediate">Intermediate · 1600</SelectItem>
                <SelectItem value="advanced">Advanced · 2000</SelectItem>
                <SelectItem value="master">Master · 2400</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={flipSides}>
              <FlipVertical className="h-4 w-4 mr-1" /> Switch sides
            </Button>
            <Button variant="outline" size="sm" onClick={() => reset()}>
              <RotateCcw className="h-4 w-4 mr-1" /> New game
            </Button>
            <Button size="sm" onClick={runReview} disabled={annotations.length < 4}>
              <BookOpen className="h-4 w-4 mr-1" /> Review
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)_360px] gap-6">
        {/* Eval + board */}
        <div className="flex gap-4 items-start justify-center">
          <EvalBar score={evalScore} />
          <div className="flex flex-col gap-3">
            <PlayerLabel name={userColor === "w" ? "Black · Coach AI" : "White · Coach AI"} thinking={aiThinking} />
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

        {/* Center column: moves */}
        <div className="border border-border rounded-lg bg-card ink-shadow flex flex-col min-h-[480px] max-h-[640px]">
          <div className="px-3 py-2 border-b border-border flex items-baseline justify-between">
            <span className="serif text-lg">Moves</span>
            <span className="mono text-xs text-muted-foreground">{totalPly} ply</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <MoveList
              annotations={annotations}
              currentPly={viewPly === 0 ? totalPly : viewPly}
              onSelect={(p) => setViewPly(p === totalPly ? 0 : p)}
            />
          </div>
        </div>

        {/* Right column: coach + chat */}
        <div className="border border-border rounded-lg bg-card ink-shadow flex flex-col min-h-[480px] max-h-[640px]">
          <Tabs defaultValue="coach" className="flex-1 flex flex-col">
            <TabsList className="m-2 grid grid-cols-2">
              <TabsTrigger value="coach">Coach</TabsTrigger>
              <TabsTrigger value="chat">Ask</TabsTrigger>
            </TabsList>
            <TabsContent value="coach" className="flex-1 overflow-y-auto m-0 p-0">
              <CoachPanel annotation={currentAnnot} loading={coachLoading && viewPly === 0} aiIntent={aiIntent} />
            </TabsContent>
            <TabsContent value="chat" className="flex-1 m-0 p-0 overflow-hidden">
              <PositionChat fen={displayedFen} pgn={displayedPgn} />
            </TabsContent>
          </Tabs>
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
