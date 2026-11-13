"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { MeetingCard } from "@/components/meeting-card";
import { Columns, cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { Messages } from "@/i18n/messages";
import {
  firstDay,
  formatMonthParam,
  lastDay,
  monthGrid,
  monthLabel,
  monthOf,
  shiftMonth,
  WEEKDAY_INITIALS,
  type Month,
} from "@/lib/calendar";
import type { AttendanceStatus, Meeting } from "@/lib/meetings";
import { capitalize, formatMediumDate, formatTime } from "@/lib/schedule";

export type GuestMeeting = {
  group_id: string;
  group_name: string;
  original_date: string;
  start_date: string;
  start_time: string;
  skipped: boolean;
  game: string | null;
  my_status: AttendanceStatus | null;
};

export type DayEntry =
  | { kind: "member"; color: string; meeting: Meeting }
  | { kind: "guest"; color: string; meeting: GuestMeeting };

const GUEST_COLOR = "#94a3b8";
export { GUEST_COLOR };

/**
 * Calendario mensile. I dati di alcuni mesi arrivano tutti insieme dal server,
 * così cambiare giorno o mese è immediato; oltre quei mesi si ricarica la pagina.
 */
export function CalendarView({
  today,
  initialMonth,
  initialDay,
  loadedFrom,
  loadedTo,
  entries,
  legend,
  hasGuest,
  home,
}: {
  today: string;
  initialMonth: Month;
  initialDay: string | null;
  /** Primo e ultimo giorno per cui ci sono i dati. */
  loadedFrom: string;
  loadedTo: string;
  entries: Record<string, DayEntry[]>;
  legend: { id: string; name: string; color: string }[];
  hasGuest: boolean;
  /**
   * Uso nella home (computer): accanto al calendario la lista dei prossimi
   * incontri; toccando un giorno si vedono solo gli incontri di quel giorno.
   * Sul telefono il calendario è nascosto e resta solo la lista.
   */
  home?: { upcoming: ReactNode; below?: ReactNode };
}) {
  const { locale, m: msg } = useI18n();
  const router = useRouter();
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(initialDay);
  const [loading, startLoading] = useTransition();

  const from = firstDay(month);
  const to = lastDay(month);
  const currentMonth = monthOf(today);
  const selected =
    selectedDay && selectedDay >= from && selectedDay <= to
      ? selectedDay
      : !home && today >= from && today <= to
        ? today
        : null;

  const href = (m: Month, day?: string | null) =>
    `/calendario?mese=${formatMonthParam(m)}${day ? `&giorno=${day}` : ""}`;

  function go(next: Month, day: string | null = null) {
    const url = href(next, day);
    if (home) {
      // Nella home: oltre i mesi caricati si apre la pagina Calendario.
      if (firstDay(next) >= loadedFrom && lastDay(next) <= loadedTo) {
        setMonth(next);
        setSelectedDay(day);
      } else {
        router.push(url);
      }
      return;
    }
    setMonth(next);
    setSelectedDay(day);
    if (firstDay(next) >= loadedFrom && lastDay(next) <= loadedTo) {
      // Dati già presenti: aggiorna solo l'indirizzo, senza ricaricare.
      window.history.replaceState(window.history.state, "", url);
    } else {
      // Mese lontano: chiede al server i dati dei mesi intorno.
      startLoading(() => router.replace(url, { scroll: false }));
    }
  }

  let count = 0;
  for (const [day, list] of Object.entries(entries)) {
    if (day >= from && day <= to)
      count += list.filter((e) => !e.meeting.skipped).length;
  }
  const selectedEntries = selected ? (entries[selected] ?? []) : [];
  const navClass =
    "ui-btn flex size-10 items-center justify-center rounded-xl border border-foreground/15 text-lg hover:bg-foreground/5";

  const calendarBlock = (
    <>
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => go(shiftMonth(month, -1))}
          aria-label={msg.calendar.prevMonth}
          className={navClass}
        >
          ‹
        </button>
        <div className="text-center">
          <h2 className="text-lg font-semibold">{monthLabel(month, locale)}</h2>
          <p className="text-xs text-foreground/55">
            {loading ? msg.common.wait : msg.common.meetings(count)}
            {formatMonthParam(month) !== formatMonthParam(currentMonth) && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => go(currentMonth)}
                  className="text-brand underline"
                >
                  {msg.calendar.today}
                </button>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => go(shiftMonth(month, 1))}
          aria-label={msg.calendar.nextMonth}
          className={navClass}
        >
          ›
        </button>
      </div>

      <div
        aria-busy={loading}
        className={cx(
          "ui-card rounded-2xl border border-foreground/10 p-2 transition-opacity",
          loading && "opacity-50",
        )}
      >
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-foreground/50">
          {WEEKDAY_INITIALS[locale].map((d, i) => (
            <span key={i}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {monthGrid(month)
            .flat()
            .map((day) => {
              const inMonth = day >= from && day <= to;
              const list = entries[day] ?? [];
              const isToday = day === today;
              const isSelected = day === selected;
              const label = `${capitalize(formatMediumDate(day, locale))}${list.length ? msg.calendar.dayMeetings(list.length) : ""}`;
              const cellClass = cx(
                "ui-day flex aspect-square flex-col items-center justify-start gap-1 overflow-hidden rounded-xl pt-1 text-sm lg:aspect-auto lg:min-h-24 lg:items-stretch lg:px-1.5 lg:text-left",
                !inMonth && "opacity-30",
                isSelected ? "bg-brand text-white" : "hover:bg-foreground/5",
                isToday && !isSelected && "ring-2 ring-brand",
              );
              const content = (
                <>
                  <span className={cx("lg:self-start", isToday && "font-bold")}>
                    {Number(day.slice(8))}
                  </span>
                  {/* Sul computer: orario e gruppo; sul telefono: puntini colorati. */}
                  <span className="hidden flex-col gap-0.5 lg:flex">
                    {list.slice(0, 3).map((e, i) => (
                      <span
                        key={i}
                        className={cx(
                          "truncate rounded px-1 text-[11px] leading-4",
                          e.meeting.skipped && "line-through opacity-50",
                          isSelected
                            ? "bg-white/20 text-white"
                            : "text-foreground",
                        )}
                        style={
                          isSelected
                            ? undefined
                            : { backgroundColor: `${e.color}33` }
                        }
                      >
                        {formatTime(
                          e.kind === "member"
                            ? e.meeting.startTime
                            : e.meeting.start_time,
                        )}{" "}
                        {e.kind === "member"
                          ? e.meeting.groupName
                          : e.meeting.group_name}
                      </span>
                    ))}
                    {list.length > 3 && (
                      <span className="px-1 text-[11px] opacity-70">
                        +{list.length - 3}
                      </span>
                    )}
                  </span>
                  <span className="flex flex-wrap justify-center gap-0.5 lg:hidden">
                    {list.slice(0, 4).map((e, i) => (
                      <span
                        key={i}
                        className={cx(
                          "ui-dot size-1.5 rounded-full",
                          e.meeting.skipped && "opacity-40",
                        )}
                        style={{
                          backgroundColor: isSelected ? "white" : e.color,
                        }}
                      />
                    ))}
                  </span>
                </>
              );
              return inMonth ? (
                <button
                  key={day}
                  type="button"
                  onClick={() => go(month, day)}
                  aria-label={label}
                  aria-current={isSelected ? "date" : undefined}
                  className={cellClass}
                >
                  {content}
                </button>
              ) : (
                <span key={day} aria-hidden className={cellClass}>
                  {content}
                </span>
              );
            })}
        </div>
      </div>

      {legend.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-foreground/70">
          {legend.map((g) => (
            <li key={g.id} className="flex items-center gap-1.5">
              <span
                className="ui-dot size-2.5 rounded-full"
                style={{ backgroundColor: g.color }}
              />
              {g.name}
            </li>
          ))}
          {hasGuest && (
            <li className="flex items-center gap-1.5">
              <span
                className="ui-dot size-2.5 rounded-full"
                style={{ backgroundColor: GUEST_COLOR }}
              />
              {msg.calendar.asGuest}
            </li>
          )}
        </ul>
      )}
    </>
  );

  const daySection = selected && (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {capitalize(formatMediumDate(selected, locale))}
        </h2>
        {home && (
          <button
            type="button"
            onClick={() => setSelectedDay(null)}
            className="text-sm text-brand underline"
          >
            {msg.calendar.showUpcoming}
          </button>
        )}
      </div>
      {selectedEntries.length === 0 ? (
        <p className="text-sm text-foreground/60">
          {msg.calendar.noMeetingsDay}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {selectedEntries.map((e) => (
            <li
              key={
                e.kind === "member"
                  ? `${e.meeting.groupId}-${e.meeting.originalDate}`
                  : `g-${e.meeting.group_id}-${e.meeting.original_date}`
              }
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
  );

  if (home) {
    return (
      <Columns
        sideFirstOnMobile
        main={
          <>
            <div className="hidden flex-col gap-5 lg:flex">{calendarBlock}</div>
            {home.below}
          </>
        }
        side={daySection || home.upcoming}
      />
    );
  }

  return <Columns main={calendarBlock} side={daySection} />;
}

function GuestEntry({
  meeting: m,
  msg,
}: {
  meeting: GuestMeeting;
  msg: Messages;
}) {
  return (
    <Link
      href={`/groups/${m.group_id}/${m.original_date}`}
      className="ui-card block rounded-2xl border border-foreground/10 p-4"
    >
      <p className="font-semibold">
        {formatTime(m.start_time)} · {m.group_name}{" "}
        <span className="text-xs font-normal text-foreground/50">
          {msg.calendar.guestTag}
        </span>
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
