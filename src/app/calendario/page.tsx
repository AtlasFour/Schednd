import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { MeetingCard } from "@/components/meeting-card";
import { cx, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import { requireUser } from "@/lib/auth";
import {
  firstDay,
  formatMonthParam,
  groupColor,
  lastDay,
  monthGrid,
  monthLabel,
  monthOf,
  parseMonth,
  shiftMonth,
  WEEKDAY_INITIALS,
  type Month,
} from "@/lib/calendar";
import type { GroupRow, MemberRole, ScheduleRow } from "@/lib/groups";
import {
  fetchOccurrences,
  meetingsBetween,
  type AttendanceStatus,
  type Meeting,
  type MeetingGroup,
} from "@/lib/meetings";
import { addDays, capitalize, formatMediumDate, formatTime, todayInTimeZone } from "@/lib/schedule";

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

type DayEntry =
  | { kind: "member"; color: string; meeting: Meeting }
  | { kind: "guest"; color: string; meeting: GuestMeeting };

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
  const from = firstDay(month);
  const to = lastDay(month);
  const selected =
    typeof giorno === "string" && /^\d{4}-\d{2}-\d{2}$/.test(giorno) && giorno >= from && giorno <= to
      ? giorno
      : today >= from && today <= to
        ? today
        : null;

  const [{ data: memberships }, { data: guestRows }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        "role, groups(id, name, timezone, default_game_title, default_location, min_attendees, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(count))",
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
    addDays(from, -62),
  );

  const byDay = new Map<string, DayEntry[]>();
  const add = (day: string, entry: DayEntry) => byDay.set(day, [...(byDay.get(day) ?? []), entry]);

  for (const g of groups) {
    for (const m of meetingsBetween(g, occurrences, user.id, from, to)) {
      add(m.date, { kind: "member", color: colors.get(g.id)!, meeting: m });
    }
  }
  for (const gm of (guestRows ?? []) as GuestMeeting[]) {
    if (gm.start_date >= from && gm.start_date <= to) {
      add(gm.start_date, { kind: "guest", color: "#94a3b8", meeting: gm });
    }
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => startTime(a).localeCompare(startTime(b)));
  }

  const monthParam = formatMonthParam(month);
  const href = (m: Month, day?: string) =>
    `/calendario?mese=${formatMonthParam(m)}${day ? `&giorno=${day}` : ""}`;
  const selectedEntries = selected ? (byDay.get(selected) ?? []) : [];
  const count = [...byDay.values()].reduce((n, l) => n + l.filter((e) => !isSkipped(e)).length, 0);

  return (
    <Page title={msg.calendar.title} back={{ href: "/", label: msg.common.home }}>
      <LiveRefresh />

      <div className="flex items-center justify-between gap-2">
        <Link
          replace
          scroll={false}
          href={href(shiftMonth(month, -1))}
          aria-label={msg.calendar.prevMonth}
          className="ui-btn flex size-10 items-center justify-center rounded-xl border border-foreground/15 text-lg hover:bg-foreground/5"
        >
          ‹
        </Link>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{monthLabel(month, locale)}</h2>
          <p className="text-xs text-foreground/55">
            {msg.common.meetings(count)}
            {monthParam !== formatMonthParam(monthOf(today)) && (
              <>
                {" · "}
                <Link href="/calendario" replace className="text-brand underline">
                  {msg.calendar.today}
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          replace
          scroll={false}
          href={href(shiftMonth(month, 1))}
          aria-label={msg.calendar.nextMonth}
          className="ui-btn flex size-10 items-center justify-center rounded-xl border border-foreground/15 text-lg hover:bg-foreground/5"
        >
          ›
        </Link>
      </div>

      <div className="ui-card rounded-2xl border border-foreground/10 p-2">
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-foreground/50">
          {WEEKDAY_INITIALS[locale].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(month).flat().map((day) => {
            const inMonth = day >= from && day <= to;
            const entries = byDay.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selected;
            const label = `${capitalize(formatMediumDate(day, locale))}${entries.length ? msg.calendar.dayMeetings(entries.length) : ""}`;
            const cellClass = cx(
              "ui-day flex aspect-square flex-col items-center justify-start gap-1 rounded-xl pt-1 text-sm",
              !inMonth && "opacity-30",
              isSelected ? "bg-brand text-white" : "hover:bg-foreground/5",
              isToday && !isSelected && "ring-2 ring-brand",
            );
            const content = (
              <>
                <span className={cx(isToday && "font-bold")}>{Number(day.slice(8))}</span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {entries.slice(0, 4).map((e, i) => (
                    <span
                      key={i}
                      className={cx("ui-dot size-1.5 rounded-full", isSkipped(e) && "opacity-40")}
                      style={{ backgroundColor: isSelected ? "white" : e.color }}
                    />
                  ))}
                </span>
              </>
            );
            return inMonth ? (
              <Link key={day} href={href(month, day)} replace scroll={false} aria-label={label} aria-current={isSelected ? "date" : undefined} className={cellClass}>
                {content}
              </Link>
            ) : (
              <span key={day} aria-hidden className={cellClass}>
                {content}
              </span>
            );
          })}
        </div>
      </div>

      {groups.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5">
              <span className="ui-dot size-2.5 rounded-full" style={{ backgroundColor: colors.get(g.id) }} />
              {g.name}
            </li>
          ))}
          {(guestRows ?? []).length > 0 && (
            <li className="flex items-center gap-1.5">
              <span className="ui-dot size-2.5 rounded-full" style={{ backgroundColor: "#94a3b8" }} />
              {msg.calendar.asGuest}
            </li>
          )}
        </ul>
      )}

      {selected && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{capitalize(formatMediumDate(selected, locale))}</h2>
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-foreground/60">{msg.calendar.noMeetingsDay}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {selectedEntries.map((e) => (
                <li
                  key={e.kind === "member" ? `${e.meeting.groupId}-${e.meeting.originalDate}` : `g-${e.meeting.group_id}-${e.meeting.original_date}`}
                  className="border-l-4 pl-2"
                  style={{ borderColor: e.color }}
                >
                  {e.kind === "member" ? (
                    <MeetingCard meeting={e.meeting} />
                  ) : (
                    <GuestEntry meeting={e.meeting} msg={msg} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Page>
  );
}

function GuestEntry({ meeting: m, msg }: { meeting: GuestMeeting; msg: Messages }) {
  return (
    <Link
      href={`/groups/${m.group_id}/${m.original_date}`}
      className="ui-card block rounded-2xl border border-foreground/10 p-4"
    >
      <p className="font-semibold">
        {formatTime(m.start_time)} · {m.group_name}{" "}
        <span className="text-xs font-normal text-foreground/50">{msg.calendar.guestTag}</span>
      </p>
      {m.game && <p className="text-sm text-foreground/60">🎲 {m.game}</p>}
      <p className="mt-1 text-sm">
        {m.skipped
          ? msg.home.skipped
          : m.my_status
            ? `${msg.labels.attendance[m.my_status].emoji} ${msg.labels.attendance[m.my_status].label}`
            : msg.home.notAnswered}
      </p>
    </Link>
  );
}

function startTime(e: DayEntry) {
  return e.kind === "member" ? e.meeting.startTime : e.meeting.start_time;
}

function isSkipped(e: DayEntry) {
  return e.kind === "member" ? e.meeting.skipped : e.meeting.skipped;
}
