// Cloud-backed long-term memory. Server functions used to mirror per-user
// learning points, weaknesses, and recent coaching headlines into Supabase
// so the coach remembers the player across browsers and devices.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const HEADLINE_CAP = 6;

/** Append a single move-memory row + headline (if any). */
export const recordMoveMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      quality: z.string().min(1).max(40),
      motifs: z.array(z.string().min(1).max(40)).max(20),
      insight: z.string().max(500).optional(),
      ply: z.number().int().min(0).max(2000).optional(),
      gameId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const isBad = data.quality === "mistake" || data.quality === "blunder" || data.quality === "inaccuracy";
    const isGood = data.quality === "brilliant" || data.quality === "great";
    const weightFor = (m: string) => {
      if (isBad) return data.quality === "blunder" ? 3 : data.quality === "mistake" ? 2 : 1;
      if (isGood) return 1;
      return 0;
    };
    const rows = data.motifs
      .map((m) => ({
        user_id: userId,
        game_id: data.gameId ?? null,
        ply: data.ply ?? null,
        motif: m,
        quality: data.quality,
        insight: data.insight ?? null,
        weight: weightFor(m),
      }))
      .filter((r) => r.weight > 0);
    if (rows.length) {
      const { error } = await supabase.from("move_memory").insert(rows);
      if (error) throw new Error(error.message);
    }
    if (data.insight && (isBad || isGood)) {
      const { error } = await supabase.from("coach_headlines").insert({
        user_id: userId,
        headline: data.insight,
      });
      if (error) throw new Error(error.message);
      // Trim to the last HEADLINE_CAP per user
      const { data: extras } = await supabase
        .from("coach_headlines")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(HEADLINE_CAP, HEADLINE_CAP + 100);
      const stale = (extras ?? []).map((r) => r.id);
      if (stale.length) {
        await supabase.from("coach_headlines").delete().in("id", stale);
      }
    }
    return { ok: true };
  });

/** Pull the aggregated memory context the coach prompt needs. */
export const getMemoryContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [weaknessesRes, headlinesRes, pointsRes] = await Promise.all([
      supabase
        .from("move_memory")
        .select("motif, weight, quality")
        .eq("user_id", userId)
        .in("quality", ["inaccuracy", "mistake", "blunder"]),
      supabase
        .from("coach_headlines")
        .select("headline, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(HEADLINE_CAP),
      supabase
        .from("move_memory")
        .select("motif, insight, quality, created_at")
        .eq("user_id", userId)
        .not("insight", "is", null)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const counts: Record<string, number> = {};
    for (const row of weaknessesRes.data ?? []) {
      counts[row.motif] = (counts[row.motif] ?? 0) + (row.weight ?? 1);
    }
    const weaknesses = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k);
    const headlines = (headlinesRes.data ?? []).map((r) => r.headline);
    const points = (pointsRes.data ?? []).map((r) => ({
      motif: r.motif,
      insight: r.insight ?? "",
      ts: new Date(r.created_at).getTime(),
      weight: r.quality === "blunder" ? 80 : 50,
    }));
    return { weaknesses, headlines, points };
  });

/** One-time merge of local-storage memory after first sign-in. */
export const mergeLocalMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      points: z.array(z.object({
        ts: z.number().int(),
        motif: z.string().min(1).max(40),
        insight: z.string().max(500),
        weight: z.number().int().min(0).max(100),
      })).max(80),
      headlines: z.array(z.string().min(1).max(500)).max(20),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.points.length) {
      const rows = data.points.map((p) => ({
        user_id: userId,
        motif: p.motif,
        quality: p.weight >= 70 ? "mistake" : "inaccuracy",
        insight: p.insight,
        weight: 1,
      }));
      await supabase.from("move_memory").insert(rows);
    }
    if (data.headlines.length) {
      const rows = data.headlines.map((h) => ({ user_id: userId, headline: h }));
      await supabase.from("coach_headlines").insert(rows);
    }
    return { ok: true };
  });

const saveGameSchema = z.object({
  id: z.string().uuid().optional(),
  pgn: z.string().min(1).max(20000),
  result: z.enum(["win", "loss", "draw", "ongoing"]),
  userColor: z.enum(["w", "b"]),
  difficulty: z.string().min(1).max(40),
  openingName: z.string().max(120).optional(),
  plyCount: z.number().int().min(0).max(2000),
  acpl: z.number().nullable().optional(),
  summary: z.any().optional(),
  finished: z.boolean().default(false),
});

export const saveGame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveGameSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const payload = {
      user_id: userId,
      pgn: data.pgn,
      result: data.result,
      user_color: data.userColor,
      difficulty: data.difficulty,
      opening_name: data.openingName ?? null,
      ply_count: data.plyCount,
      acpl: data.acpl ?? null,
      summary_json: data.summary ?? null,
      finished_at: data.finished ? new Date().toISOString() : null,
    };
    if (data.id) {
      const { data: row, error } = await supabase
        .from("games")
        .update(payload)
        .eq("id", data.id)
        .eq("user_id", userId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { id: row.id };
    }
    const { data: row, error } = await supabase
      .from("games")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });

export const getGameHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("games")
      .select("id, result, user_color, difficulty, opening_name, ply_count, acpl, finished_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { games: data ?? [] };
  });

export const getGameById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("games")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (error) throw new Error(error.message);
    return { game: row };
  });
