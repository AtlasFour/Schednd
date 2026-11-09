import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { GameCard } from "@/components/game-card";
import { ButtonLink, cx, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getGroupDetail } from "@/lib/groups";
import { fitsPlayers, type GroupLibraryGame } from "@/lib/library";

export const metadata: Metadata = { title: "Libreria del gruppo" };

const PLAYER_FILTERS = [2, 3, 4, 5, 6, 7, 8];

export default function GroupLibraryPage(props: PageProps<"/groups/[id]/libreria">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GroupLibrary {...props} />
    </Suspense>
  );
}

async function GroupLibrary({ params, searchParams }: PageProps<"/groups/[id]/libreria">) {
  const { id } = await params;
  const { giocatori } = await searchParams;
  const { supabase } = await requireUser();
  const group = await getGroupDetail(supabase, id);
  if (!group) notFound();

  const { data, error } = await supabase.rpc("group_library", { p_group_id: id });
  if (error) console.error("group_library", error);
  const all = (data ?? []) as GroupLibraryGame[];

  const players = Number(giocatori);
  const filter = Number.isInteger(players) && players > 0 ? players : null;
  const games = filter ? all.filter((g) => fitsPlayers(g, filter)) : all;

  return (
    <Page
      title="Libreria del gruppo"
      subtitle={`${group.name} · ${all.length} giochi dei membri`}
      back={{ href: `/groups/${id}`, label: group.name }}
    >
      <nav aria-label="Filtra per numero di giocatori" className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-foreground/60">👥 Giocatori:</span>
        <FilterChip href={`/groups/${id}/libreria`} active={!filter}>
          Tutti
        </FilterChip>
        {PLAYER_FILTERS.map((n) => (
          <FilterChip key={n} href={`/groups/${id}/libreria?giocatori=${n}`} active={filter === n}>
            {n}
          </FilterChip>
        ))}
      </nav>

      {all.length === 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-foreground/60">
            Nessun membro ha ancora aggiunto giochi. Inizia dalla tua libreria!
          </p>
          <ButtonLink href="/libreria" variant="secondary" small className="self-start">
            📚 La mia libreria
          </ButtonLink>
        </div>
      ) : games.length === 0 ? (
        <p className="text-sm text-foreground/60">Nessun gioco adatto a {filter} giocatori.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {games.map((g) => (
            <li key={g.game_id}>
              <GameCard game={g}>
                <p className="mt-1 text-xs text-foreground/60">
                  {g.favorite_count > 0 && (
                    <span className="mr-2 text-amber-500">★ {g.favorite_count}</span>
                  )}
                  di {g.owners.join(", ")}
                </p>
              </GameCard>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-foreground/50">
        I giochi più amati (★) sono in cima. Per aggiungere i tuoi giochi o segnare i preferiti
        vai nella{" "}
        <Link href="/libreria" className="text-brand underline">
          tua libreria
        </Link>
        .
      </p>
    </Page>
  );
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={active ? "page" : undefined}
      className={cx(
        "ui-chip rounded-full border px-3 py-1 text-sm",
        active ? "border-brand bg-brand text-white" : "border-foreground/15 hover:bg-foreground/5",
      )}
    >
      {children}
    </Link>
  );
}
