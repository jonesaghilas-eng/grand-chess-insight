
-- Shared updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ profiles ============
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  preferred_difficulty TEXT NOT NULL DEFAULT 'intermediate',
  persona TEXT NOT NULL DEFAULT 'mentor',
  voice_id TEXT NOT NULL DEFAULT 'IKne3meq5aSn9XLyUdCD',
  voice_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own profile" ON public.profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ games ============
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pgn TEXT NOT NULL,
  result TEXT NOT NULL,                  -- 'win' | 'loss' | 'draw' | 'ongoing'
  user_color TEXT NOT NULL,              -- 'w' | 'b'
  difficulty TEXT NOT NULL,
  opening_name TEXT,
  ply_count INTEGER NOT NULL DEFAULT 0,
  acpl NUMERIC,                          -- average centipawn loss
  summary_json JSONB,                    -- the deep review payload
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_user_finished ON public.games(user_id, finished_at DESC NULLS LAST);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.games TO authenticated;
GRANT ALL ON public.games TO service_role;

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own games" ON public.games
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own games" ON public.games
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own games" ON public.games
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own games" ON public.games
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_games_updated_at
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ move_memory ============
CREATE TABLE public.move_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  ply INTEGER,
  motif TEXT NOT NULL,
  quality TEXT NOT NULL,
  insight TEXT,
  weight INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_move_memory_user_motif ON public.move_memory(user_id, motif);
CREATE INDEX idx_move_memory_user_created ON public.move_memory(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.move_memory TO authenticated;
GRANT ALL ON public.move_memory TO service_role;

ALTER TABLE public.move_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own move memory" ON public.move_memory
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own move memory" ON public.move_memory
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own move memory" ON public.move_memory
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own move memory" ON public.move_memory
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============ coach_headlines ============
CREATE TABLE public.coach_headlines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  headline TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_headlines_user_created ON public.coach_headlines(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_headlines TO authenticated;
GRANT ALL ON public.coach_headlines TO service_role;

ALTER TABLE public.coach_headlines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own headlines" ON public.coach_headlines
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own headlines" ON public.coach_headlines
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own headlines" ON public.coach_headlines
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
