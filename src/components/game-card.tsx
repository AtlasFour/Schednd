import type { ReactNode } from "react";
import { formatPlayers, formatPlayingTime, GAME_KIND_LABELS, type LibraryGame } from "@/lib/library";

const KIND_EMOJI: Record<LibraryGame["kind"], string> = {
  board: "🎲",
  rpg: "🐉",
  card: "🃏",
  online: "💻",
  other: "🧩",
};

export function GameCard({ game, children }: { game: LibraryGame; children?: ReactNode }) {
  const details = [
    formatPlayers(game.min_players, game.max_players),
    formatPlayingTime(game.playing_minutes),
  ].filter(Boolean);
  return (
    <article className="ui-card flex items-start gap-3 rounded-2xl border border-foreground/10 p-3">
      {game.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={game.image_url}
          alt=""
          width={56}
          height={56}
          loading="lazy"
          className="size-14 shrink-0 rounded-xl bg-foreground/5 object-cover"
        />
      ) : (
        <div
          aria-hidden
          className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-2xl"
        >
          {KIND_EMOJI[game.kind]}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-tight">
          {game.title}
          {game.bgg_id && (
            <a
              href={`https://boardgamegeek.com/boardgame/${game.bgg_id}`}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-xs font-normal text-foreground/40 hover:text-brand"
              title="Apri su BoardGameGeek"
            >
              BGG ↗
            </a>
          )}
        </p>
        <p className="text-xs text-foreground/60">
          {details.length > 0 ? details.join(" · ") : GAME_KIND_LABELS[game.kind]}
        </p>
        {children}
      </div>
    </article>
  );
}
