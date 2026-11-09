import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { ButtonLink, Card, inputClass, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { nextDates, type GroupRow, type MemberRole, type ScheduleRow } from "@/lib/groups";
import { formatShortDate, formatTime, relativeDay } from "@/lib/schedule";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { goToInviteCode } from "./groups/actions";

type MyGroup = {
  role: MemberRole;
  groups:
    | (Pick<GroupRow, "id" | "name" | "timezone" | "default_game_title" | "status"> & {
        group_schedules: ScheduleRow[];
      })
    | null;
};

export default function HomePage() {
  if (!getSupabaseEnv()) {
    return <MissingConfig />;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-6">
      <Suspense fallback={<HomeSkeleton />}>
        <Home />
      </Suspense>
    </main>
  );
}

async function Home() {
  const { supabase, user } = await requireUser();

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "role, groups(id, name, timezone, default_game_title, status, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until))",
      )
      .eq("user_id", user.id),
  ]);

  const groups = ((memberships ?? []) as unknown as MyGroup[])
    .filter((m): m is MyGroup & { groups: NonNullable<MyGroup["groups"]> } => m.groups !== null)
    .map((m) => {
      const { today, dates } = nextDates(m.groups, 1);
      return { ...m.groups, role: m.role, today, next: dates[0] };
    })
    .sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999"));

  return (
    <>
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground/60">Ciao 👋</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <ButtonLink href="/profile" variant="secondary" small aria-label="Profilo">
          👤 Profilo
        </ButtonLink>
      </header>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">I miei gruppi</h2>
          <ButtonLink href="/groups/new" small>
            + Nuovo
          </ButtonLink>
        </div>

        {groups.length === 0 ? (
          <Card>
            <p className="text-sm text-foreground/70">
              Non fai ancora parte di nessun gruppo. Creane uno, oppure apri il
              link d&apos;invito che ti hanno mandato.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {groups.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/groups/${g.id}`}
                  className="block rounded-2xl border border-foreground/10 p-4 transition hover:border-brand/50 hover:bg-brand/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{g.name}</p>
                      {g.default_game_title && (
                        <p className="truncate text-sm text-foreground/60">
                          🎲 {g.default_game_title}
                        </p>
                      )}
                    </div>
                    {g.role === "owner" && (
                      <span className="shrink-0 text-xs text-foreground/50">owner</span>
                    )}
                  </div>
                  {g.next && (
                    <p className="mt-2 text-sm">
                      <span className="font-medium capitalize">{formatShortDate(g.next.date)}</span>{" "}
                      alle {formatTime(g.next.startTime)}{" "}
                      <span className="text-foreground/50">· {relativeDay(g.next.date, g.today)}</span>
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card title="Hai un codice d'invito?">
        <form action={goToInviteCode} className="flex gap-2">
          <input
            name="code"
            required
            placeholder="Codice o link"
            aria-label="Codice d'invito"
            autoCapitalize="characters"
            autoCorrect="off"
            className={`${inputClass} h-9 text-sm`}
          />
          <SubmitButton variant="secondary" small>
            Vai
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}

function HomeSkeleton() {
  return (
    <>
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-12">
      <h1 className="text-xl font-semibold">Configurazione mancante</h1>
      <p className="text-sm text-foreground/70">
        Le variabili <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> non sono impostate. Aggiungile
        su Vercel (Settings → Environment Variables) e ripubblica il sito.
      </p>
    </main>
  );
}
