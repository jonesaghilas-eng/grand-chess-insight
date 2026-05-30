import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Crown, ChevronLeft, Loader2 } from "lucide-react";
import { getGameHistory } from "@/lib/memory.functions";
import { useAuthOptional } from "@/hooks/useAuthOptional";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/games")({
  head: () => ({
    meta: [
      { title: "Your games · Caïssa" },
      { name: "description", content: "Every game you've played against Caïssa — open any one to see the deep coach review." },
    ],
  }),
  component: GamesPage,
});

function GamesPage() {
  const { signedIn, loading: authLoading } = useAuthOptional();
  const fetchHistory = useServerFn(getGameHistory);
  const { data, isLoading } = useQuery({
    queryKey: ["games"],
    queryFn: () => fetchHistory(),
    enabled: signedIn,
  });

  if (authLoading) return null;
  if (!signedIn) {
    return (
      <div className="min-h-[100dvh] bg-background paper-grain flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-4">
          <Crown className="h-6 w-6 text-accent mx-auto" />
          <p className="serif italic">Sign in to see your game history.</p>
          <Button asChild><Link to="/login">Sign in</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background paper-grain">
      <header className="border-b border-border bg-card/70 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-12 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" /> Back to play
          </Link>
          <div className="flex items-center gap-2">
            <Crown className="h-4 w-4 text-accent" />
            <span className="serif text-lg leading-none">Your games</span>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> loading…</div>
        )}
        {data && data.games.length === 0 && (
          <p className="serif italic text-muted-foreground text-center py-12">
            No games yet. Play one — it'll show up here.
          </p>
        )}
        {data && data.games.length > 0 && (
          <ul className="divide-y divide-border border border-border rounded-xl bg-card overflow-hidden">
            {data.games.map((g: any) => (
              <li key={g.id} className="px-4 py-3 flex items-baseline justify-between gap-3 hover:bg-muted/40 transition-colors">
                <div className="min-w-0">
                  <div className="serif text-sm truncate">
                    {g.opening_name ?? "Unnamed opening"}
                  </div>
                  <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {new Date(g.created_at).toLocaleString()} · {g.difficulty} · {g.user_color === "w" ? "White" : "Black"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-xs mono uppercase tracking-widest ${
                    g.result === "win" ? "text-success" : g.result === "loss" ? "text-destructive" : "text-muted-foreground"
                  }`}>{g.result}</div>
                  <div className="text-[10px] text-muted-foreground">{g.ply_count} ply{g.acpl != null ? ` · ${Math.round(Number(g.acpl))} acpl` : ""}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-center text-[10px] mono uppercase tracking-widest text-muted-foreground mt-6">
          Deep per-game review · coming next
        </p>
      </main>
    </div>
  );
}
