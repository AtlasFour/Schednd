import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LiveRefresh } from "@/components/live-refresh";
import { MeetingCard } from "@/components/meeting-card";
import { cx, Page, PageSkeleton } from "@/components/ui";
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
  ATTENDANCE_LABELS,
  fetchOccurrences,
  meetingsBetween,
  type AttendanceStatus,
  type Meeting,
  type MeetingGroup,
} from "@/lib/meetings";
import { addDays, capitalize, formatMediumDate, formatTime, todayInTimeZone } from "@/lib/schedule";

export const metadata: Metadata = { title: "Calendario" };

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
    .sort((a, b) => a.name.localeCompare(b.name, "it"));

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
    <Page title="Calendario" back={{ href: "/", label: "Home" }}>
      <LiveRefresh />

      <div className="flex items-center justify-between gap-2">
        <Link
          replace
          scroll={false}
          href={href(shiftMonth(month, -1))}
          aria-label="Mese precedente"
          className="ui-btn flex size-10 items-center justify-center rounded-xl border border-foreground/15 text-lg hover:bg-foreground/5"
        >
          ‹
        </Link>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{monthLabel(month)}</h2>
          <p className="text-xs text-foreground/55">
            {count === 1 ? "1 incontro" : `${count} incontri`}
            {monthParam !== formatMonthParam(monthOf(today)) && (
              <>
                {" · "}
                <Link href="/calendario" replace className="text-brand underline">
                  oggi
                </Link>
              </>
            )}
          </p>
        </div>
        <Link
          replace
          scroll={false}
          href={href(shiftMonth(month, 1))}
          aria-label="Mese successivo"
          className="ui-btn flex size-10 items-center justify-center rounded-xl border border-foreground/15 text-lg hover:bg-foreground/5"
        >
          ›
        </Link>
      </div>

      <div className="ui-card rounded-2xl border border-foreground/10 p-2">
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-foreground/50">
          {WEEKDAY_INITIALS.map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(month).flat().map((day) => {
            const inMonth = day >= from && day <= to;
            const entries = byDay.get(day) ?? [];
            const isToday = day === today;
            const isSelected = day === selected;
            const label = `${capitalize(formatMediumDate(day))}${entries.length ? `, ${entries.length} incontri` : ""}`;
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
              Come ospite
            </li>
          )}
        </ul>
      )}

      {selected && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{capitalize(formatMediumDate(selected))}</h2>
          {selectedEntries.length === 0 ? (
            <p className="text-sm text-foreground/60">Nessun incontro in questo giorno.</p>
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
                    <GuestEntry meeting={e.meeting} />
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

function GuestEntry({ meeting: m }: { meeting: GuestMeeting }) {
  return (
    <Link
      href={`/groups/${m.group_id}/${m.original_date}`}
      className="ui-card block rounded-2xl border border-foreground/10 p-4"
    >
      <p className="font-semibold">
        {formatTime(m.start_time)} · {m.group_name}{" "}
        <span className="text-xs font-normal text-foreground/50">(ospite)</span>
      </p>
      {m.game && <p className="text-sm text-foreground/60">🎲 {m.game}</p>}
      <p className="mt-1 text-sm">
        {m.skipped
          ? "⏭️ Incontro saltato"
          : m.my_status
            ? `${ATTENDANCE_LABELS[m.my_status].emoji} ${ATTENDANCE_LABELS[m.my_status].label}`
            : "Non hai ancora risposto"}
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
