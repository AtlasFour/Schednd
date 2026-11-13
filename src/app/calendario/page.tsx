import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import {
  firstDay,
  formatMonthParam,
  lastDay,
  monthOf,
  parseMonth,
  shiftMonth,
  type Month,
} from "@/lib/calendar";
import type { GroupRow, MemberRole, ScheduleRow } from "@/lib/groups";
import { fetchOccurrences, type MeetingGroup } from "@/lib/meetings";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { CalendarView, type GuestMeeting } from "./calendar-view";
import { buildCalendarEntries } from "./entries";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.calendar.title };
}

type MyGroup = {
  role: MemberRole;
  groups:
    | (Pick<GroupRow, "id" | "name" | "timezone" | "default_game_title" | "default_location" | "min_attendees"> & {
        group_schedules: ScheduleRow[];
        memberships: { count: number }[];
      })
    | null;
};

/** Mesi caricati prima e dopo quello mostrato: spostarsi tra questi è immediato. */
const MONTHS_BEFORE = 2;
const MONTHS_AFTER = 4;

export default function CalendarPage(props: PageProps<"/calendario">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Calendar {...props} />
    </Suspense>
  );
}

async function Calendar({ searchParams }: PageProps<"/calendario">) {
  const { mese, giorno } = await searchParams;
  const { supabase, user } = await requireUser();
  const { locale, m: msg } = await getI18n();

  const today = todayInTimeZone("Europe/Rome");
  const month: Month = parseMonth(mese) ?? monthOf(today);
  const loadedFrom = firstDay(shiftMonth(month, -MONTHS_BEFORE));
  const loadedTo = lastDay(shiftMonth(month, MONTHS_AFTER));
  const day = typeof giorno === "string" && /^\d{4}-\d{2}-\d{2}$/.test(giorno) ? giorno : null;

  const [{ data: memberships }, { data: guestRows }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "role, groups(id, name, timezone, default_game_title, default_location, min_attendees, kind, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(count))",
      )
      .eq("user_id", user.id),
    supabase.rpc("my_guest_meetings"),
  ]);

  const groups: MeetingGroup[] = ((memberships ?? []) as unknown as MyGroup[])
    .filter((m): m is MyGroup & { groups: NonNullable<MyGroup["groups"]> } => m.groups !== null)
    .map((m) => ({ ...m.groups, memberCount: m.groups.memberships[0]?.count ?? 1 }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  const occurrences = await fetchOccurrences(
    supabase,
    groups.map((g) => g.id),
    addDays(loadedFrom, -62),
  );

  const guestMeetings = (guestRows ?? []) as GuestMeeting[];
  const { entries, legend } = buildCalendarEntries(groups, occurrences, guestMeetings, user.id, loadedFrom, loadedTo);

  return (
    <Page title={msg.calendar.title} back={{ href: "/", label: msg.common.home }} wide>
      <LiveRefresh />
      <CalendarView
        // Nuovi dati dal server (mese lontano): si riparte da quel mese.
        key={formatMonthParam(month)}
        today={today}
        initialMonth={month}
        initialDay={day}
        loadedFrom={loadedFrom}
        loadedTo={loadedTo}
        entries={entries}
        legend={legend}
        hasGuest={guestMeetings.length > 0}
      />
    </Page>
  );
}
