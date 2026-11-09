"use server";

import { requireUser } from "@/lib/auth";
import { fetchBggCollection } from "@/lib/bgg";
import {getOptionalInt, getString, type FormState} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import type { GameKind } from "@/lib/library";
import { afterMutation } from "@/lib/revalidate";

const KINDS: GameKind[] = ["board", "rpg", "card", "online", "other"];

export async function addManualGame(_prev: FormState, formData: FormData): Promise<FormState> {
  const { m } = await getI18n();
  const title = getString(formData, "title");
  if (!title) return { error: m.actions.gameNameRequired };
  if (title.length > 120) return { error: m.actions.gameNameTooLong };
  const kind = (getString(formData, "kind") || "board") as GameKind;
  if (!KINDS.includes(kind)) return { error: m.actions.gameKindInvalid };

  const min = getOptionalInt(formData, "min_players");
  const max = getOptionalInt(formData, "max_players");
  const minutes = getOptionalInt(formData, "playing_minutes");
  for (const [n, top] of [
    [min, 99],
    [max, 99],
    [minutes, 9999],
  ] as const) {
    if (n !== null && !(n >= 1 && n <= top)) return { error: m.actions.checkNumbers };
  }

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("add_manual_game", {
    p_title: title,
    p_kind: kind,
    p_min_players: min,
    p_max_players: max,
    p_playing_minutes: minutes,
  });
  if (error) {
    console.error("add_manual_game", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: m.actions.gameAdded(title) };
}

export async function toggleFavorite(gameId: string, favorite: boolean): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("user_games")
    .update({ is_favorite: favorite })
    .eq("user_id", user.id)
    .eq("game_id", gameId);
  if (error) {
    console.error("toggleFavorite", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return {};
}

export async function removeGame(gameId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("user_games")
    .delete()
    .eq("user_id", user.id)
    .eq("game_id", gameId);
  if (error) console.error("removeGame", error);
  afterMutation();
}

export async function importFromBgg(): Promise<FormState> {
  const { m } = await getI18n();
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("bgg_username")
    .eq("id", user.id)
    .maybeSingle();
  const username = profile?.bgg_username?.trim();
  if (!username) {
    return { error: m.actions.bggUsernameFirst };
  }

  const result = await fetchBggCollection(username);
  if (!result.ok) return { error: m.actions.bggError(result.reason, result.detail) };

  const { data, error } = await supabase.rpc("sync_bgg_collection", { p_games: result.games });
  if (error) {
    console.error("sync_bgg_collection", error);
    return { error: await dbErrorMessage(error) };
  }
  const stats = (data as { added: number; removed: number; total: number }[] | null)?.[0];
  afterMutation();
  return {
    success: m.actions.bggImported(result.games.length, stats?.added ?? 0, stats?.removed ?? 0),
  };
}
