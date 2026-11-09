import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { GameCard } from "@/components/game-card";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { MyLibraryGame } from "@/lib/library";
import { removeGame } from "./actions";
import { AddGameForm, BggImportButton, FavoriteButton } from "./library-client";

export const metadata: Metadata = { title: "La mia libreria" };

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
  games: Omit<MyLibraryGame, "game_id" | "is_favorite" | "source"> & { id: string };
};

async function Library() {
  const { supabase, user } = await requireUser();
  const [{ data: rows }, { data: profile }] = await Promise.all([
    supabase
      .from("user_games")
      .select("is_favorite, source, games(id, title, kind, min_players, max_players, playing_minutes, image_url, bgg_id)")
      .eq("user_id", user.id),
    supabase.from("profiles").select("bgg_username").eq("id", user.id).maybeSingle(),
  ]);

  const games: MyLibraryGame[] = ((rows ?? []) as unknown as Row[])
    .filter((r) => r.games)
    .map((r) => ({ ...r.games, game_id: r.games.id, is_favorite: r.is_favorite, source: r.source }))
    .sort(
      (a, b) =>
        Number(b.is_favorite) - Number(a.is_favorite) || a.title.localeCompare(b.title, "it"),
    );

  const bggReady = Boolean(process.env.BGG_API_TOKEN);

  return (
    <Page
      title="La mia libreria"
      subtitle={`${games.length} ${games.length === 1 ? "gioco" : "giochi"} · i preferiti sono in cima`}
      back={{ href: "/", label: "Home" }}
    >
      <Card title="BoardGameGeek">
        {!bggReady ? (
          <p className="text-sm text-foreground/70">
            L&apos;import da BoardGameGeek non è ancora attivo sul server.{" "}
            <Link href="/profile/configurazione" className="text-brand underline">
              Vedi la configurazione
            </Link>
            .
          </p>
        ) : profile?.bgg_username ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground/70">
              Importa i giochi che possiedi dalla collezione di{" "}
              <strong>{profile.bgg_username}</strong> (espansioni escluse). Puoi ripetere
              l&apos;import per aggiornarla.
            </p>
            <BggImportButton />
          </div>
        ) : (
          <p className="text-sm text-foreground/70">
            Inserisci il tuo nome utente BoardGameGeek nel{" "}
            <Link href="/profile" className="text-brand underline">
              profilo
            </Link>{" "}
            per importare la tua collezione.
          </p>
        )}
      </Card>

      <AddGameForm />

      {games.length === 0 ? (
        <p className="text-sm text-foreground/60">
          La tua libreria è vuota. Aggiungi i giochi che possiedi: compariranno nella libreria dei
          tuoi gruppi e nelle proposte di cambio gioco.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <li key={g.game_id}>
              <GameCard game={g}>
                <div className="mt-1 flex items-center gap-1">
                  <FavoriteButton gameId={g.game_id} favorite={g.is_favorite} />
                  <form action={removeGame.bind(null, g.game_id)}>
                    <SubmitButton
                      variant="ghost"
                      small
                      className="h-7 px-2 text-xs"
                      confirm={`Togliere "${g.title}" dalla tua libreria?`}
                    >
                      Togli
                    </SubmitButton>
                  </form>
                  {g.source === "bgg" && (
                    <span className="ml-auto text-xs text-foreground/40">da BGG</span>
                  )}
                </div>
              </GameCard>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-foreground/40">
        Dati dei giochi importati da BoardGameGeek (boardgamegeek.com).
      </p>
    </Page>
  );
}
