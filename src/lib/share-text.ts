import type { Locale } from "../i18n/config";
import type { Messages } from "../i18n/messages";
import { capitalize, formatLongDate, formatTime } from "./schedule";

export type ShareMeeting = {
  groupName: string;
  date: string;
  startTime: string;
  skipped: boolean;
  game: string | null;
  location: string | null;
  onlineLink: string | null;
  notes: string | null;
  minAttendees: number | null;
  openProposals: number;
  people: { yes: string[]; maybe: string[]; no: string[]; noAnswer: string[] };
};

/**
 * Riepilogo di un incontro da mandare in una chat di gruppo (WhatsApp, Telegram…).
 * `bold` decide come evidenziare il titolo nel formato della chat.
 */
export function meetingSummaryLines(
  s: ShareMeeting,
  m: Messages,
  locale: Locale,
  bold: (text: string) => string = (t) => `*${t}*`,
): string[] {
  const lines = [
    bold(`🎲 ${s.groupName}`),
    `📅 ${capitalize(formatLongDate(s.date, locale))} · ${formatTime(s.startTime)}`,
  ];
  if (s.skipped) {
    lines.push("", m.share.skipped);
    return lines;
  }
  if (s.game) lines.push(`${m.share.game} ${s.game}`);
  if (s.location) lines.push(`${m.share.place} ${s.location}`);
  if (s.onlineLink) lines.push(`${m.share.online} ${s.onlineLink}`);
  if (s.notes) lines.push(`📝 ${s.notes}`);
  lines.push("");

  const group = (label: string, names: string[]) => {
    if (names.length > 0) lines.push(`${label}: ${names.join(", ")}`);
  };
  if (s.people.yes.length === 0) lines.push(m.share.yes(0));
  group(m.share.yes(s.people.yes.length), s.people.yes);
  group(m.share.maybe(s.people.maybe.length), s.people.maybe);
  group(m.share.no(s.people.no.length), s.people.no);
  group(m.share.noAnswer(s.people.noAnswer.length), s.people.noAnswer);

  if (s.minAttendees) {
    const missing = s.minAttendees - s.people.yes.length;
    lines.push(missing > 0 ? m.share.missing(missing) : m.share.gameOn);
  }
  if (s.openProposals > 0) lines.push(m.share.proposals(s.openProposals));
  return lines;
}

/** Link di WhatsApp che apre la scelta della chat con il testo già scritto. */
export function whatsappShareUrl(text: string) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Persone di un incontro divise per risposta (in ordine alfabetico). */
export function peopleByStatus(
  participants: { user_id: string; name: string }[],
  attendances: { user_id: string; status: "yes" | "maybe" | "no" }[],
  locale: Locale,
  unknownName: string,
): ShareMeeting["people"] {
  const names = new Map(participants.map((p) => [p.user_id, p.name]));
  const people: ShareMeeting["people"] = { yes: [], maybe: [], no: [], noAnswer: [] };
  const answered = new Set<string>();
  for (const a of attendances) {
    answered.add(a.user_id);
    people[a.status].push(names.get(a.user_id) ?? unknownName);
  }
  for (const p of participants) if (!answered.has(p.user_id)) people.noAnswer.push(p.name);
  const sort = (list: string[]) => list.sort((a, b) => a.localeCompare(b, locale));
  sort(people.yes);
  sort(people.maybe);
  sort(people.no);
  sort(people.noAnswer);
  return people;
}
