import { Link } from "@tanstack/react-router";
import { LogIn, LogOut, History, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuthOptional } from "@/hooks/useAuthOptional";
import { clearMemory } from "@/lib/memory";

export function AuthMenu() {
  const { user, signedIn } = useAuthOptional();

  if (!signedIn) {
    return (
      <Button asChild size="sm" variant="outline" className="h-8 hidden sm:inline-flex">
        <Link to="/login">
          <LogIn className="h-3.5 w-3.5 mr-1.5" /> Sign in to remember
        </Link>
      </Button>
    );
  }

  const initial = (user?.user_metadata?.full_name ?? user?.email ?? "?").slice(0, 1).toUpperCase();
  const name = user?.user_metadata?.full_name ?? user?.email ?? "Player";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title={name}>
          <span className="h-7 w-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-semibold serif">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="serif text-sm leading-tight">{name}</span>
            <span className="text-[10px] text-muted-foreground mono uppercase tracking-widest">Caïssa member</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/games" className="cursor-pointer">
            <History className="h-3.5 w-3.5 mr-2" /> Game history
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled className="opacity-60">
          <UserIcon className="h-3.5 w-3.5 mr-2" /> Profile (soon)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-destructive focus:text-destructive"
          onSelect={async () => {
            await supabase.auth.signOut();
            clearMemory();
          }}
        >
          <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
