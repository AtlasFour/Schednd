import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import {
  firstDay,
  formatMonthParam,
  groupColor,
  lastDay,
  monthOf,
  parseMonth,
  shiftMonth,
  type Month,
} from "@/lib/calendar";
import type { GroupRow, MemberRole, ScheduleRow } from "@/lib/groups";
import { fetchOccurrences, meetingsBetween, type MeetingGroup } from "@/lib/meetings";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { CalendarView, GUEST_COLOR, type DayEntry, type GuestMeeting } from "./calendar-view";

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

  const colors = new Map(groups.map((g, i) => [g.id, groupColor(g.id, i)]));
  const occurrences = await fetchOccurrences(
    supabase,
    groups.map((g) => g.id),
    addDays(loadedFrom, -62),
  );

  const entries: Record<string, DayEntry[]> = {};
  const add = (d: string, entry: DayEntry) => (entries[d] ??= []).push(entry);

  for (const g of groups) {
    for (const m of meetingsBetween(g, occurrences, user.id, loadedFrom, loadedTo)) {
      add(m.date, { kind: "member", color: colors.get(g.id)!, meeting: m });
    }
  }
  const guestMeetings = (guestRows ?? []) as GuestMeeting[];
  for (const gm of guestMeetings) {
    if (gm.start_date >= loadedFrom && gm.start_date <= loadedTo) {
      add(gm.start_date, { kind: "guest", color: GUEST_COLOR, meeting: gm });
    }
  }
  const startTime = (e: DayEntry) => (e.kind === "member" ? e.meeting.startTime : e.meeting.start_time);
  for (const list of Object.values(entries)) list.sort((a, b) => startTime(a).localeCompare(startTime(b)));

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
        legend={groups.map((g) => ({ id: g.id, name: g.name, color: colors.get(g.id)! }))}
        hasGuest={guestMeetings.length > 0}
      />
    </Page>
  );
}
