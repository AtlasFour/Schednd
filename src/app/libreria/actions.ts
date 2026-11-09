"use server";

import { requireUser } from "@/lib/auth";
import { fetchBggCollection } from "@/lib/bgg";
import { dbErrorMessage, getOptionalInt, getString, type FormState } from "@/lib/form";
import type { GameKind } from "@/lib/library";
import { afterMutation } from "@/lib/revalidate";

const KINDS: GameKind[] = ["board", "rpg", "card", "online", "other"];

export async function addManualGame(_prev: FormState, formData: FormData): Promise<FormState> {
  const title = getString(formData, "title");
  if (!title) return { error: "Scrivi il nome del gioco." };
  if (title.length > 120) return { error: "Il nome può avere al massimo 120 caratteri." };
  const kind = (getString(formData, "kind") || "board") as GameKind;
  if (!KINDS.includes(kind)) return { error: "Tipo di gioco non valido." };

  const min = getOptionalInt(formData, "min_players");
  const max = getOptionalInt(formData, "max_players");
  const minutes = getOptionalInt(formData, "playing_minutes");
  for (const [n, top] of [
    [min, 99],
    [max, 99],
    [minutes, 9999],
  ] as const) {
    if (n !== null && !(n >= 1 && n <= top)) return { error: "Controlla i numeri inseriti." };
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
    return { error: dbErrorMessage(error) };
  }
  afterMutation();
  return { success: `"${title}" aggiunto alla tua libreria.` };
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
    return { error: dbErrorMessage(error) };
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
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("bgg_username")
    .eq("id", user.id)
    .maybeSingle();
  const username = profile?.bgg_username?.trim();
  if (!username) {
    return { error: "Inserisci prima il tuo nome utente BoardGameGeek nel profilo." };
  }

  const result = await fetchBggCollection(username);
  if (!result.ok) return { error: result.message };

  const { data, error } = await supabase.rpc("sync_bgg_collection", { p_games: result.games });
  if (error) {
    console.error("sync_bgg_collection", error);
    return { error: dbErrorMessage(error) };
  }
  const stats = (data as { added: number; removed: number; total: number }[] | null)?.[0];
  afterMutation();
  if (!stats) return { success: "Collezione importata." };
  const parts = [`${result.games.length} giochi trovati su BGG`];
  if (stats.added) parts.push(`${stats.added} aggiunti`);
  if (stats.removed) parts.push(`${stats.removed} rimossi perché non più nella collezione`);
  return { success: `Importazione completata: ${parts.join(", ")}.` };
}
