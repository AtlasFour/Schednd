import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { GameCard } from "@/components/game-card";
import { Card, Columns, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import type { MyLibraryGame } from "@/lib/library";
import { removeGame } from "./actions";
import { AddGameForm, BggImportButton, FavoriteButton } from "./library-client";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.library.myTitle };
}

export default function LibraryPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Library />
    </Suspense>
  );
}

type Row = {
  is_favorite: boolean;
  source: "manual" | "bgg";
  games: Omit<MyLibraryGame, "game_id" | "is_favorite" | "source"> & {
    id: string;
  };
};

async function Library() {
  const { supabase, user } = await requireUser();
  const { locale, m } = await getI18n();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("user_games")
      .select(
        "is_favorite, source, games(id, title, kind, min_players, max_players, playing_minutes, image_url, bgg_id)",
      )
      .eq("user_id", user.id),
    supabase
      .from("profiles")
      .select("bgg_username")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const games: MyLibraryGame[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.games)
    .map((r) => ({
      ...r.games,
      game_id: r.games.id,
      is_favorite: r.is_favorite,
      source: r.source,
    }))
    .sort(
      (a, b) =>
        Number(b.is_favorite) - Number(a.is_favorite) ||
        a.title.localeCompare(b.title, locale),
    );

  const bggReady = Boolean(process.env.BGG_API_TOKEN);

  return (
    <Page
      title={m.library.myTitle}
      subtitle={m.library.mySubtitle(m.common.games(games.length))}
      back={{ href: "/", label: m.common.home }}
      wide
    >
      <Columns
        sideFirstOnMobile
        side={
          <>
            <Card title="BoardGameGeek">
              {!bggReady ? (
                <p className="text-sm text-foreground/70">
                  {m.library.bggNotActive}{" "}
                  <Link
                    href="/profile/configurazione"
                    className="text-brand underline"
                  >
                    {m.library.seeConfig}
                  </Link>
                  .
                </p>
              ) : profile?.bgg_username ? (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-foreground/70">
                    {m.library.bggImportFrom}{" "}
                    <strong>{profile.bgg_username}</strong>{" "}
                    {m.library.bggImportAfter}
                  </p>
                  <BggImportButton />
                </div>
              ) : (
                <p className="text-sm text-foreground/70">
                  {m.library.bggEnterUsernameBefore}{" "}
                  <Link href="/profile" className="text-brand underline">
                    {m.library.bggEnterUsernameLink}
                  </Link>{" "}
                  {m.library.bggEnterUsernameAfter}
                </p>
              )}
            </Card>

            <Card>
              <AddGameForm />
            </Card>
            <p className="text-xs text-foreground/40">{m.library.bggCredit}</p>
          </>
        }
        main={
          <>
            {games.length === 0 ? (
              <p className="text-sm text-foreground/60">{m.library.empty}</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {games.map((g) => (
                  <li key={g.game_id}>
                    <GameCard game={g}>
                      <div className="mt-1 flex items-center gap-1">
                        <FavoriteButton
                          gameId={g.game_id}
                          favorite={g.is_favorite}
                        />
                        <form action={removeGame.bind(null, g.game_id)}>
                          <SubmitButton
                            variant="ghost"
                            small
                            className="h-7 px-2 text-xs"
                            confirm={m.library.confirmRemove(g.title)}
                          >
                            {m.library.remove}
                          </SubmitButton>
                        </form>
                        {g.source === "bgg" && (
                          <span className="ml-auto text-xs text-foreground/40">
                            {m.library.fromBgg}
                          </span>
                        )}
                      </div>
                    </GameCard>
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      />
    </Page>
  );
}
