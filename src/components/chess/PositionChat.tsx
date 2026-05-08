import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { chatAboutPosition } from "@/lib/coach.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export function PositionChat({ fen, pgn }: { fen: string; pgn: string }) {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Ask me anything about this position — threats, plans, tactics, ideas." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const askFn = useServerFn(chatAboutPosition);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await askFn({ data: {
        fen, pgn, question: q,
        history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
      }});
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      setMessages([...next, { role: "assistant", content: `⚠️ ${e.message ?? "Error"}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 px-3">
        <div className="space-y-3 py-3">
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "ml-6" : "mr-6"}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 mono">
                {m.role === "user" ? "You" : "Coach"}
              </div>
              <div className={`rounded-md p-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "bg-foreground text-background" : "bg-muted text-foreground"
              }`}>{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="mr-6 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-3 w-3 animate-spin" /> thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      </ScrollArea>
      <div className="border-t border-border p-2 flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="What's the best plan here?"
          disabled={loading}
          className="font-serif"
        />
        <Button onClick={send} disabled={loading} size="icon" variant="default">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
