export type GameKind = "board" | "rpg" | "card" | "online" | "other";

export const GAME_KINDS: GameKind[] = ["board", "rpg", "card", "online", "other"];

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

/** Vero se il gioco va bene per `players` persone (dati mancanti = va bene). */
export function fitsPlayers(game: Pick<LibraryGame, "min_players" | "max_players">, players: number) {
  if (game.min_players && players < game.min_players) return false;
  if (game.max_players && players > game.max_players) return false;
  return true;
}
