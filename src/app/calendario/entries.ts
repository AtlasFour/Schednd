import { groupColor } from "@/lib/calendar";
import { meetingsBetween, type MeetingGroup, type OccurrenceRow } from "@/lib/meetings";
import { GUEST_COLOR, type DayEntry, type GuestMeeting } from "./calendar-view";

/** Incontri (da membro e da ospite) raggruppati per giorno, con il colore del gruppo. */
export function buildCalendarEntries(
  groups: MeetingGroup[],
  occurrences: OccurrenceRow[],
  guestMeetings: GuestMeeting[],
  userId: string,
  from: string,
  to: string,
) {
  const colors = new Map(groups.map((g, i) => [g.id, groupColor(g.id, i)]));
  const entries: Record<string, DayEntry[]> = {};
  const add = (d: string, entry: DayEntry) => (entries[d] ??= []).push(entry);

  for (const g of groups) {
    for (const m of meetingsBetween(g, occurrences, userId, from, to)) {
      add(m.date, { kind: "member", color: colors.get(g.id)!, meeting: m });
    }
  }
  for (const gm of guestMeetings) {
    if (gm.start_date >= from && gm.start_date <= to) {
      add(gm.start_date, { kind: "guest", color: GUEST_COLOR, meeting: gm });
    }
  }
  const startTime = (e: DayEntry) => (e.kind === "member" ? e.meeting.startTime : e.meeting.start_time);
  for (const list of Object.values(entries)) list.sort((a, b) => startTime(a).localeCompare(startTime(b)));

  const legend = groups.map((g) => ({ id: g.id, name: g.name, color: colors.get(g.id)! }));
  return { entries, legend };
}
