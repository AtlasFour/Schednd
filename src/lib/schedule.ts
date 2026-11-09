/**
 * Calcolo delle date degli incontri a partire dalle ricorrenze di un gruppo.
 *
 * Le date sono stringhe "YYYY-MM-DD" (date di calendario nel fuso del gruppo),
 * gli orari stringhe "HH:MM" o "HH:MM:SS". Così i calcoli non dipendono dal
 * fuso del server né dall'ora legale.
 */

export type Schedule = {
  anchorDate: string;
  intervalWeeks: number;
  startTime: string;
  /** Esclusivo: la ricorrenza vale per le date < validUntil. */
  validUntil: string | null;
};

export type ScheduledDate = {
  date: string;
  startTime: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromDayNumber(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Data di oggi ("YYYY-MM-DD") nel fuso orario indicato. */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Prossime `count` date (da `fromDate` compresa) secondo una ricorrenza. */
function datesForSchedule(
  schedule: Schedule,
  fromDate: string,
  count: number,
): ScheduledDate[] {
  const anchor = toDayNumber(schedule.anchorDate);
  const from = toDayNumber(fromDate);
  const until =
    schedule.validUntil === null ? Infinity : toDayNumber(schedule.validUntil);
  const step = schedule.intervalWeeks * 7;

  let first = anchor;
  if (from > anchor) {
    first = anchor + Math.ceil((from - anchor) / step) * step;
  }

  const result: ScheduledDate[] = [];
  for (let day = first; day < until && result.length < count; day += step) {
    result.push({ date: fromDayNumber(day), startTime: schedule.startTime });
  }
  return result;
}

/** Prossime `count` date di un gruppo, unendo tutte le sue ricorrenze. */
export function upcomingDates(
  schedules: Schedule[],
  fromDate: string,
  count: number,
): ScheduledDate[] {
  return schedules
    .flatMap((s) => datesForSchedule(s, fromDate, count))
    .sort((a, b) =>
      a.date === b.date
        ? a.startTime.localeCompare(b.startTime)
        : a.date.localeCompare(b.date),
    )
    .slice(0, count);
}

/** Ricorrenza attualmente in vigore (quella senza data di fine). */
export function currentSchedule<T extends { validUntil: string | null }>(
  schedules: T[],
): T | undefined {
  return schedules.find((s) => s.validUntil === null);
}

const WEEKDAYS = [
  "lunedì",
  "martedì",
  "mercoledì",
  "giovedì",
  "venerdì",
  "sabato",
  "domenica",
];

/** Giorno della settimana in italiano (es. "mercoledì"). */
export function weekdayName(date: string): string {
  const day = toDayNumber(date);
  // Il giorno 0 (1/1/1970) era un giovedì.
  return WEEKDAYS[(((day + 3) % 7) + 7) % 7];
}

/** "ogni mercoledì", "ogni 2 settimane, il venerdì" */
export function describeRecurrence(schedule: {
  anchorDate: string;
  intervalWeeks: number;
  startTime: string;
}): string {
  const weekday = weekdayName(schedule.anchorDate);
  const time = formatTime(schedule.startTime);
  if (schedule.intervalWeeks === 1) {
    return `ogni ${weekday} alle ${time}`;
  }
  return `ogni ${schedule.intervalWeeks} settimane, di ${weekday}, alle ${time}`;
}

/** "21:00" da "21:00:00" */
export function formatTime(time: string): string {
  return time.slice(0, 5);
}

/** "mer 18 nov" */
export function formatShortDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "mercoledì 18 novembre" */
export function formatMediumDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "mercoledì 18 novembre 2026" */
export function formatLongDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "oggi", "domani", "tra 5 giorni" */
export function relativeDay(date: string, today: string): string {
  const diff = toDayNumber(date) - toDayNumber(today);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff < 0) return diff === -1 ? "ieri" : `${-diff} giorni fa`;
  return `tra ${diff} giorni`;
}
