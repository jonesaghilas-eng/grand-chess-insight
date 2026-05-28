import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { chatAboutPosition } from "@/lib/coach.functions";
import { Avatar, type AvatarMood } from "@/components/chess/Avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Mic, MicOff, Volume2, Play, X, BookOpen, ArrowRight, Sparkles, AlertTriangle, Lightbulb } from "lucide-react";
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
  alternatives?: { san: string; why: string }[];
  referencedPrinciple?: string;
  threatLineSan?: string[];   // up to 3 SAN moves to animate as "what could happen"
  threatFen?: string;          // FEN to start animating from
  text?: string;               // for user/assistant/system/ai
};

const QUALITY = {
  brilliant: { label: "Brilliant", dot: "oklch(0.55 0.13 220)" },
  great:     { label: "Great",     dot: "var(--success)" },
  good:      { label: "Good",      dot: "var(--muted-foreground)" },
  inaccuracy:{ label: "Inaccuracy",dot: "var(--warn)" },
  mistake:   { label: "Mistake",   dot: "var(--warn)" },
  blunder:   { label: "Blunder",   dot: "var(--destructive)" },
} as Record<string, { label: string; dot: string }>;

type Props = {
  feed: CoachFeedItem[];
  mood: AvatarMood;
  speaking: boolean;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  onSpeak: (text: string) => void;
  onPlayThreat: (item: CoachFeedItem) => void;
  threatPlayingId: string | null;
  onAbortThreat: () => void;
  fen: string;
  pgn: string;
  coachThinking: boolean;
};

export function UnifiedChat({
  feed, mood, speaking, voiceEnabled, onToggleVoice, onSpeak,
  onPlayThreat, threatPlayingId, onAbortThreat,
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

  // Merge external feed (coach annotations) with locally tracked chat
  useEffect(() => { setItems(feed); }, [feed]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [items, coachThinking, asking]);

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
    <div className="flex flex-col h-full bg-card border border-border rounded-lg ink-shadow overflow-hidden">
      {/* Avatar header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-gradient-to-b from-paper-deep/40 to-transparent">
        <Avatar mood={mood} speaking={speaking} size={56} name="Caïssa" />
        <div className="flex-1 min-w-0">
          <div className="serif text-base leading-tight">Your coach</div>
          <div className="mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            {coachThinking ? "calculating…" : speaking ? "speaking" : mood}
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
          {items.length === 0 && (
            <div className="text-center py-10 px-4 text-muted-foreground">
              <Sparkles className="h-5 w-5 mx-auto opacity-60 mb-2" />
              <p className="serif italic text-sm">Make a move. I'll explain what just happened — and what could happen next.</p>
            </div>
          )}
          {items.map((it) => (
            <FeedRow
              key={it.id}
              item={it}
              onSpeak={onSpeak}
              voiceEnabled={voiceEnabled}
              onPlayThreat={onPlayThreat}
              isPlayingThreat={threatPlayingId === it.id}
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

      {/* Composer */}
      <div className="border-t border-border p-2 flex gap-2 items-center bg-card">
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
          placeholder={mic.listening ? "Listening…" : "Ask anything about this position"}
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
  item, onSpeak, voiceEnabled, onPlayThreat, isPlayingThreat, onAbortThreat,
}: {
  item: CoachFeedItem;
  onSpeak: (text: string) => void;
  voiceEnabled: boolean;
  onPlayThreat: (item: CoachFeedItem) => void;
  isPlayingThreat: boolean;
  onAbortThreat: () => void;
}) {
  if (item.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground text-background px-3.5 py-2 text-sm leading-relaxed">
          {item.text}
        </div>
      </div>
    );
  }
  if (item.kind === "assistant") {
    return (
      <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
        {item.text}
      </div>
    );
  }
  if (item.kind === "system") {
    return <div className="text-[11px] text-muted-foreground italic px-1">{item.text}</div>;
  }
  if (item.kind === "ai") {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50 text-xs">
        <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Opp</span>
        <span className="serif text-sm">{item.san}</span>
        <span className="text-muted-foreground italic text-[11px] truncate">{item.text}</span>
      </div>
    );
  }

  // Coach annotation
  const q = QUALITY[item.quality ?? "good"];
  const showThreatBtn = (item.quality === "blunder" || item.quality === "mistake") && (item.threatLineSan?.length ?? 0) > 0;
  return (
    <div className="rounded-xl border border-border bg-background/50 px-3.5 py-3 space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: q?.dot }} />
          <span className="serif text-sm">{item.san}</span>
          <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">{q?.label}</span>
        </div>
        {voiceEnabled && (
          <Button size="icon" variant="ghost" className="h-6 w-6 -my-1" onClick={() => onSpeak([item.headline, item.narrative].filter(Boolean).join(" "))}>
            <Volume2 className="h-3 w-3" />
          </Button>
        )}
      </div>
      {item.headline && <p className="serif text-[15px] leading-snug">{item.headline}</p>}
      {item.narrative && <p className="text-sm leading-relaxed text-foreground/85">{item.narrative}</p>}

      {showThreatBtn && !isPlayingThreat && (
        <button
          onClick={() => onPlayThreat(item)}
          className="group w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/40 bg-destructive/5 hover:bg-destructive/10 transition-colors text-left"
        >
          <span className="flex items-center justify-center h-6 w-6 rounded-full bg-destructive/80 text-destructive-foreground shrink-0 group-hover:scale-110 transition-transform">
            <Play className="h-3 w-3 ml-0.5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs mono uppercase tracking-widest text-destructive">Watch what could happen</div>
            <div className="text-[11px] text-muted-foreground truncate serif italic">{item.threatLineSan?.slice(0, 3).join(" ")}</div>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
        </button>
      )}
      {isPlayingThreat && (
        <button
          onClick={onAbortThreat}
          className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs mono uppercase tracking-widest animate-pulse"
        >
          <X className="h-3 w-3" /> Stop preview
        </button>
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

      {item.referencedPrinciple && (
        <div className="flex items-center gap-1.5 text-[10px] mono text-muted-foreground italic pt-0.5">
          <BookOpen className="h-3 w-3" /> {item.referencedPrinciple}
        </div>
      )}
    </div>
  );
}
