import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { chatAboutPosition } from "@/lib/coach.functions";
import { Avatar, type AvatarMood } from "@/components/chess/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Mic, MicOff, Volume2, Play, X, BookOpen, Lightbulb, ChevronDown } from "lucide-react";
import { useMic } from "@/hooks/useMic";
import { cn } from "@/lib/utils";

export type CoachFeedItem = {
  id: string;
  kind: "coach" | "ai" | "user" | "assistant" | "system";
  ply?: number;
  san?: string;
  color?: "w" | "b";
  quality?: string;
  headline?: string;
  narrative?: string;
  threeMovesAhead?: string;
  deepen?: string;             // long-form theory / positional read
  captionedPlies?: { san: string; caption: string }[]; // one caption per opponent ply
  alternatives?: { san: string; why: string }[];
  referencedPrinciple?: string;
  threatLineSan?: string[];
  threatFen?: string;
  fenBefore?: string;
  text?: string;
};

const QUALITY = {
  brilliant: { label: "Brilliant", dot: "oklch(0.55 0.13 220)", bar: "oklch(0.55 0.13 220)" },
  great:     { label: "Great",     dot: "var(--success)",        bar: "var(--success)" },
  good:      { label: "Good",      dot: "var(--muted-foreground)", bar: "var(--muted-foreground)" },
  inaccuracy:{ label: "Inaccuracy",dot: "var(--warn)",            bar: "var(--warn)" },
  mistake:   { label: "Mistake",   dot: "var(--warn)",            bar: "var(--warn)" },
  blunder:   { label: "Blunder",   dot: "var(--destructive)",     bar: "var(--destructive)" },
} as Record<string, { label: string; dot: string; bar: string }>;

const FEED_TAIL = 30;

type Props = {
  feed: CoachFeedItem[];
  mood: AvatarMood;
  speaking: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onSpeak: (text: string) => void;
  onPlayThreat: (item: CoachFeedItem) => void;
  onPlayAlternative: (item: CoachFeedItem, altSan: string) => void;
  threatPlayingId: string | null;
  threatStep?: number;
  onAbortThreat: () => void;
  fen: string;
  pgn: string;
  coachThinking: boolean;
};

export function UnifiedChat({
  feed, mood, speaking, voiceEnabled, onToggleVoice, onSpeak,
  onPlayThreat, onPlayAlternative, threatPlayingId, threatStep, onAbortThreat,
  fen, pgn, coachThinking,
}: Props) {
  const [items, setItems] = useState<CoachFeedItem[]>(feed);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const askFn = useServerFn(chatAboutPosition);
  const endRef = useRef<HTMLDivElement>(null);
  const mic = useMic({
    onResult: (text) => { setInput((v) => (v ? v + " " : "") + text); },
  });

  useEffect(() => { setItems(feed); }, [feed]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items.length, coachThinking, asking]);

  // Show only tail to keep long games snappy
  const visible = useMemo(() => {
    if (items.length <= FEED_TAIL) return { hidden: 0, list: items };
    return { hidden: items.length - FEED_TAIL, list: items.slice(-FEED_TAIL) };
  }, [items]);

  async function send() {
    const q = input.trim();
    if (!q || asking) return;
    const userMsg: CoachFeedItem = { id: `u-${Date.now()}`, kind: "user", text: q };
    setItems((p) => [...p, userMsg]);
    setInput("");
    setAsking(true);
    try {
      const history = items.filter((i) => i.kind === "user" || i.kind === "assistant").slice(-10)
        .map((i) => ({ role: i.kind === "user" ? "user" as const : "assistant" as const, content: i.text ?? "" }));
      const res = await askFn({ data: { fen, pgn, question: q, history } });
      const reply: CoachFeedItem = { id: `a-${Date.now()}`, kind: "assistant", text: res.reply };
      setItems((p) => [...p, reply]);
      if (voiceEnabled) onSpeak(res.reply);
    } catch (e: any) {
      setItems((p) => [...p, { id: `e-${Date.now()}`, kind: "system", text: `⚠️ ${e?.message ?? "Error"}` }]);
    } finally { setAsking(false); }
  }

  function toggleMic() {
    if (!mic.supported) return;
    if (mic.listening) mic.stop();
    else mic.start();
  }

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-xl ink-shadow overflow-hidden">
      {/* Sticky avatar header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-b from-paper-deep/50 to-transparent backdrop-blur-md sticky top-0 z-10">
        <Avatar mood={mood} speaking={speaking} size={52} />
        <div className="flex-1 min-w-0">
          <div className="serif text-base leading-tight">Caïssa</div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {coachThinking ? "calculating" : speaking ? "speaking" : mood}
          </div>
        </div>
        <Button
          variant={voiceEnabled ? "default" : "ghost"}
          size="icon"
          className="h-8 w-8"
          onClick={onToggleVoice}
          title={voiceEnabled ? "Mute" : "Speak aloud"}
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Feed */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-3 space-y-2.5">
          {visible.hidden > 0 && (
            <div className="text-center text-[10px] mono uppercase tracking-widest text-muted-foreground py-1">
              {visible.hidden} earlier moves
            </div>
          )}
          {items.length === 0 && (
            <div className="text-center py-10 px-4 text-muted-foreground">
              <p className="serif italic text-sm leading-relaxed">
                Make a move.<br/>I'll explain what just happened — and what could happen next.
              </p>
            </div>
          )}
          {visible.list.map((it) => (
            <FeedRow
              key={it.id}
              item={it}
              onSpeak={onSpeak}
              voiceEnabled={voiceEnabled}
              onPlayThreat={onPlayThreat}
              onPlayAlternative={onPlayAlternative}
              isPlayingThreat={threatPlayingId === it.id}
              threatStep={threatPlayingId === it.id ? threatStep ?? 0 : 0}
              onAbortThreat={onAbortThreat}
            />
          ))}
          {coachThinking && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs mono pl-1">
              <Loader2 className="h-3 w-3 animate-spin" /> reading the position…
            </div>
          )}
          {asking && (
            <div className="flex items-center gap-2 text-muted-foreground text-xs mono pl-1">
              <Loader2 className="h-3 w-3 animate-spin" /> thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>

      {/* Sticky composer */}
      <div className="border-t border-border p-2 flex gap-2 items-center bg-card/95 backdrop-blur-md sticky bottom-0">
        {mic.supported && (
          <Button
            type="button"
            size="icon"
            variant={mic.listening ? "default" : "ghost"}
            className={cn("h-9 w-9 shrink-0", mic.listening && "animate-pulse")}
            onClick={toggleMic}
            title={mic.listening ? "Stop listening" : "Push to talk"}
          >
            {mic.listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
        <Input
          value={input + (mic.interim ? ` ${mic.interim}` : "")}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={mic.listening ? "Listening…" : "Ask about this position"}
          disabled={asking}
          className="font-serif"
        />
        <Button onClick={send} disabled={asking || !input.trim()} size="icon" className="h-9 w-9 shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FeedRow({
  item, onSpeak, voiceEnabled, onPlayThreat, onPlayAlternative, isPlayingThreat, threatStep, onAbortThreat,
}: {
  item: CoachFeedItem;
  onSpeak: (text: string) => void;
  voiceEnabled: boolean;
  onPlayThreat: (item: CoachFeedItem) => void;
  onPlayAlternative: (item: CoachFeedItem, altSan: string) => void;
  isPlayingThreat: boolean;
  threatStep: number;
  onAbortThreat: () => void;
}) {
  const [showDeepen, setShowDeepen] = useState(false);

  if (item.kind === "user") {
    return (
      <div className="flex justify-end animate-in fade-in slide-in-from-right-2 duration-200">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground text-background px-3.5 py-2 text-sm leading-relaxed">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap animate-in fade-in slide-in-from-left-2 duration-200">
        {item.text}
      </div>
    );
  }
  if (item.kind === "system") {
    return <div className="text-[11px] text-muted-foreground italic px-1">{item.text}</div>;
  }
  if (item.kind === "ai") {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/40 text-xs animate-in fade-in duration-200">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Opp</span>
        <span className="serif text-sm">{item.san}</span>
        <span className="text-muted-foreground italic text-[11px] truncate">{item.text}</span>
      </div>
    );
  }

  // Coach annotation — magazine card with severity ribbon
  const q = QUALITY[item.quality ?? "good"];
  const showThreatBtn = (item.quality === "blunder" || item.quality === "mistake") && (item.threatLineSan?.length ?? 0) > 0;
  const hasDeepen = !!(item.deepen && item.deepen.length > 0);

  return (
    <div className="relative rounded-xl border border-border bg-background/60 pl-4 pr-3.5 py-3 space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300 overflow-hidden">
      {/* Severity ribbon */}
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: q?.bar }} />

      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="serif text-base leading-none">{item.san}</span>
          <span className="mono text-[10px] uppercase tracking-widest" style={{ color: q?.dot }}>{q?.label}</span>
        </div>
        {voiceEnabled && (
          <Button size="icon" variant="ghost" className="h-6 w-6 -my-1" onClick={() => onSpeak([item.headline, item.narrative].filter(Boolean).join(" "))}>
            <Volume2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {item.headline && <p className="serif italic text-[15px] leading-snug text-foreground/95">{item.headline}</p>}
      {item.narrative && <p className="text-sm leading-relaxed text-foreground/85">{item.narrative}</p>}

      {showThreatBtn && !isPlayingThreat && (
        <button
          onClick={() => onPlayThreat(item)}
          className="group w-full mt-1 flex items-center gap-2.5 px-3 py-2 rounded-lg border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 hover:scale-[1.01] transition-all text-left"
        >
          <span className="flex items-center justify-center h-7 w-7 rounded-full bg-destructive text-destructive-foreground shrink-0 group-hover:scale-110 transition-transform shadow-md">
            <Play className="h-3.5 w-3.5 ml-0.5" fill="currentColor" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] mono uppercase tracking-widest text-destructive">Watch what could happen</div>
            <div className="text-[11px] text-muted-foreground truncate serif italic">{item.threatLineSan?.slice(0, 3).join(" ")}</div>
          </div>
        </button>
      )}
      {isPlayingThreat && (
        <div className="mt-1 space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
          <div className="flex items-center justify-between">
            <span className="mono text-[10px] uppercase tracking-widest text-destructive">
              Step {Math.min(threatStep + 1, item.threatLineSan?.length ?? 0)} / {item.threatLineSan?.length ?? 0}
            </span>
            <button onClick={onAbortThreat} className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <X className="h-3 w-3" /> stop
            </button>
          </div>
          {item.captionedPlies?.[threatStep] && (
            <p className="text-xs leading-relaxed serif italic text-foreground/90 animate-in fade-in duration-200" key={threatStep}>
              <span className="serif text-sm not-italic mr-1">{item.captionedPlies[threatStep].san}</span>
              — {item.captionedPlies[threatStep].caption}
            </p>
          )}
        </div>
      )}

      {item.threeMovesAhead && !showThreatBtn && (
        <div className="text-[12px] text-muted-foreground leading-relaxed border-l-2 border-border pl-2.5 italic font-serif">
          {item.threeMovesAhead}
        </div>
      )}

      {item.alternatives && item.alternatives.length > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest mono text-accent-foreground/80">
            <Lightbulb className="h-3 w-3" /> Better
          </div>
          {item.alternatives.slice(0, 2).map((a, i) => (
            <div key={i} className="text-xs flex items-baseline gap-2">
              <span className="serif text-sm">{a.san}</span>
              <span className="text-muted-foreground">— {a.why}</span>
            </div>
          ))}
        </div>
      )}

      {hasDeepen && (
        <div>
          <button
            onClick={() => setShowDeepen((v) => !v)}
            className="text-[10px] mono uppercase tracking-widest text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", showDeepen && "rotate-180")} />
            {showDeepen ? "Less" : "Read more"}
          </button>
          {showDeepen && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/80 font-serif border-l-2 border-accent/60 pl-3 animate-in fade-in slide-in-from-top-1 duration-200">
              {item.deepen}
            </p>
          )}
        </div>
      )}

      {item.referencedPrinciple && (
        <div className="flex items-center gap-1.5 text-[10px] mono text-muted-foreground italic pt-0.5">
          <BookOpen className="h-3 w-3" /> {item.referencedPrinciple}
        </div>
      )}
    </div>
  );
}
