export type GameKind = "board" | "rpg" | "card" | "online" | "other";

export const GAME_KIND_LABELS: Record<GameKind, string> = {
  board: "Gioco da tavolo",
  rpg: "Gioco di ruolo",
  card: "Gioco di carte",
  online: "Gioco online",
  other: "Altro",
};

export type LibraryGame = {
  game_id: string;
  title: string;
  kind: GameKind;
  min_players: number | null;
  max_players: number | null;
  playing_minutes: number | null;
  image_url: string | null;
  bgg_id: number | null;
};

export type MyLibraryGame = LibraryGame & { is_favorite: boolean; source: "manual" | "bgg" };

export type GroupLibraryGame = LibraryGame & {
  owners: string[];
  favorite_count: number;
  my_favorite: boolean;
};

/** "3–4 giocatori", "2+ giocatori", "fino a 5 giocatori" */
export function formatPlayers(min: number | null, max: number | null): string | null {
  if (min && max) return min === max ? `${min} giocatori` : `${min}–${max} giocatori`;
  if (min) return `${min}+ giocatori`;
  if (max) return `fino a ${max} giocatori`;
  return null;
}

/** "90 min", "2 ore", "2 h 30" */
export function formatPlayingTime(minutes: number | null): string | null {
  if (!minutes) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return h === 1 ? "1 ora" : `${h} ore`;
  return `${h} h ${m}`;
}

/** Vero se il gioco va bene per `players` persone (dati mancanti = va bene). */
export function fitsPlayers(game: Pick<LibraryGame, "min_players" | "max_players">, players: number) {
  if (game.min_players && players < game.min_players) return false;
  if (game.max_players && players > game.max_players) return false;
  return true;
}
