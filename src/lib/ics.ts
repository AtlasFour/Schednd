import { zonedTimestamp } from "./schedule";

/** Un evento da esportare nei calendari (Google, Apple, Outlook). */
export type CalendarEvent = {
  /** Identificativo stabile: lo stesso incontro deve avere sempre lo stesso uid. */
  uid: string;
  title: string;
  description?: string;
  location?: string | null;
  url?: string;
  /** "YYYY-MM-DD" e "HH:MM[:SS]" nel fuso orario indicato. */
  date: string;
  time: string;
  timeZone: string;
  durationMinutes: number;
  cancelled?: boolean;
};

/** "20261118T200000Z" */
function utcStamp(ms: number) {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function eventRange(e: Pick<CalendarEvent, "date" | "time" | "timeZone" | "durationMinutes">) {
  const start = zonedTimestamp(e.date, e.time, e.timeZone);
  return { start, end: start + e.durationMinutes * 60_000 };
}

/** Testo secondo RFC 5545: \\ ; , e a capo vanno protetti. */
function escapeText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Righe lunghe spezzate a 75 byte (continuazione con uno spazio). */
function fold(line: string) {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    if (bytes.encode(current + ch).length > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** Documento iCalendar con uno o più eventi. */
export function buildIcs(events: CalendarEvent[], calendarName = "Schednd", now = Date.now()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Schednd//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(calendarName)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
  ];
  for (const e of events) {
    const { start, end } = eventRange(e);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(now)}`,
      `DTSTART:${utcStamp(start)}`,
      `DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(e.title)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push(`STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Link "aggiungi a Google Calendar" per un singolo evento. */
export function googleCalendarUrl(e: CalendarEvent) {
  const { start, end } = eventRange(e);
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    ctz: e.timeZone,
  });
  const details = [e.description, e.url].filter(Boolean).join("\n\n");
  if (details) params.set("details", details);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Link per abbonarsi da Google Calendar a un calendario iCal pubblico. */
export function googleSubscribeUrl(icsUrl: string) {
  const webcal = icsUrl.replace(/^https?:\/\//, "webcal://");
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`;
}
