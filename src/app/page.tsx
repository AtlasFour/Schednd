import Link from "next/link";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { ButtonLink, Card, inputClass, Skeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { LiveRefresh } from "@/components/live-refresh";
import { MeetingCard } from "@/components/meeting-card";
import type { GroupRow, MemberRole, ScheduleRow } from "@/lib/groups";
import { getI18n } from "@/i18n/server";
import {
  fetchOccurrences,
  upcomingMeetings,
  type AttendanceStatus,
  type Meeting,
  type MeetingGroup,
} from "@/lib/meetings";
import {
  addDays,
  capitalize,
  formatShortDate,
  formatTime,
  todayInTimeZone,
} from "@/lib/schedule";
import { closeDueProposals } from "@/lib/proposals-server";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { goToInviteCode } from "./groups/actions";

type MyGroup = {
  role: MemberRole;
  groups:
    | (Pick<
        GroupRow,
        | "id"
        | "name"
        | "timezone"
        | "default_game_title"
        | "default_location"
        | "min_attendees"
        | "status"
      > & {
        group_schedules: ScheduleRow[];
        memberships: { count: number }[];
      })
    | null;
};

type GuestMeeting = {
  group_id: string;
  group_name: string;
  original_date: string;
  start_date: string;
  start_time: string;
  skipped: boolean;
  game: string | null;
  my_status: AttendanceStatus | null;
};

/** Quanti giorni avanti mostrare nella home. */
const HOME_WINDOW_DAYS = 21;

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
  const { locale, m } = await getI18n();
  const msg = m;

  const [{ data: profile }, { data: memberships }, { data: guestRows }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase
      .from("memberships")
      .select(
        "role, groups(id, name, timezone, default_game_title, default_location, min_attendees, status, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(count))",
      )
      .eq("user_id", user.id),
    supabase.rpc("my_guest_meetings"),
  ]);
  const guestMeetings = (guestRows ?? []) as GuestMeeting[];

  const groups: (MeetingGroup & { role: MemberRole })[] = (
    (memberships ?? []) as unknown as MyGroup[]
  )
    .filter((m): m is MyGroup & { groups: NonNullable<MyGroup["groups"]> } => m.groups !== null)
    .map((m) => ({
      ...m.groups,
      role: m.role,
      memberCount: m.groups.memberships[0]?.count ?? 1,
    }));

  const yesterday = addDays(todayInTimeZone("Europe/Rome"), -1);
  await closeDueProposals(supabase);
  const occurrences = await fetchOccurrences(
    supabase,
    groups.map((g) => g.id),
    yesterday,
  );

  const meetings = groups
    .flatMap((g) => upcomingMeetings(g, occurrences, user.id, 4))
    .filter((m) => m.date <= addDays(m.today, HOME_WINDOW_DAYS))
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date),
    );

  const nextByGroup = new Map<string, Meeting>();
  for (const m of groups.flatMap((g) => upcomingMeetings(g, occurrences, user.id, 1))) {
    nextByGroup.set(m.groupId, m);
  }

  const toAnswer = meetings.filter((m) => !m.skipped && m.myStatus === null).length;

  return (
    <>
      <LiveRefresh />
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-foreground/60">{m.home.hello}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {profile?.display_name ?? user.email}
          </h1>
        </div>
        <div className="flex shrink-0 gap-2">
          <ButtonLink href="/calendario" variant="secondary" small aria-label={m.home.calendar}>
            📅
          </ButtonLink>
          <ButtonLink href="/libreria" variant="secondary" small aria-label={m.home.myLibrary}>
            📚
          </ButtonLink>
          <ButtonLink href="/profile" variant="secondary" small aria-label={m.common.profile}>
            👤 {m.common.profile}
          </ButtonLink>
        </div>
      </header>

      {guestMeetings.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{m.home.asGuest}</h2>
          <ul className="flex flex-col gap-3">
            {guestMeetings.map((m) => (
              <li key={`${m.group_id}-${m.original_date}`}>
                <Link
                  href={`/groups/${m.group_id}/${m.original_date}`}
                  className="ui-card flex items-center justify-between gap-3 rounded-2xl border border-brand/30 bg-brand/5 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {capitalize(formatShortDate(m.start_date, locale))} · {formatTime(m.start_time)}
                    </p>
                    <p className="truncate text-sm">{m.group_name}</p>
                    {m.game && <p className="truncate text-sm text-foreground/60">🎲 {m.game}</p>}
                    <p className="mt-1 text-sm">
                      {m.skipped
                        ? msg.home.skipped
                        : m.my_status
                          ? `${msg.labels.attendance[m.my_status].emoji} ${msg.labels.attendance[m.my_status].label}`
                          : msg.home.notAnswered}
                    </p>
                  </div>
                  <span aria-hidden className="text-foreground/40">›</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{m.home.upcoming}</h2>
            {toAnswer > 0 && (
              <span className="text-sm text-brand">
                {m.home.toConfirm(toAnswer)}
              </span>
            )}
          </div>
          {meetings.length === 0 ? (
            <Card>
              <p className="text-sm text-foreground/70">{m.home.noUpcoming}</p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {meetings.map((m) => (
                <li key={`${m.groupId}-${m.originalDate}`}>
                  <MeetingCard meeting={m} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{m.home.myGroups}</h2>
          <ButtonLink href="/groups/new" small>
            {m.home.newGroup}
          </ButtonLink>
        </div>

        {groups.length === 0 ? (
          <Card>
            <p className="text-sm text-foreground/70">{m.home.noGroups}</p>
          </Card>
        ) : (
          <ul className="ui-card flex flex-col divide-y divide-foreground/10 rounded-2xl border border-foreground/10">
            {groups
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, locale))
              .map((g) => {
                const next = nextByGroup.get(g.id);
                return (
                  <li key={g.id}>
                    <Link
                      href={`/groups/${g.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-foreground/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{g.name}</p>
                        <p className="truncate text-xs text-foreground/60">
                          {m.common.members(g.memberCount)}
                          {next && (
                            <>
                              {` · ${m.home.next} `}
                              {formatShortDate(next.date, locale)}{" "}
                              {formatTime(next.startTime)}
                            </>
                          )}
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-2 text-foreground/40">
                        {g.role === "owner" && <span className="text-xs">{m.common.owner}</span>}
                        <span aria-hidden>›</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <Card title={m.home.inviteTitle}>
        <form action={goToInviteCode} className="flex gap-2">
          <input
            name="code"
            required
            placeholder={m.home.invitePlaceholder}
            aria-label={m.home.inviteLabel}
            autoCapitalize="characters"
            autoCorrect="off"
            className={`${inputClass} h-9 text-sm`}
          />
          <SubmitButton variant="secondary" small>
            {m.home.go}
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
