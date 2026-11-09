import type { Messages } from "@/i18n/messages";
import type { CalendarEvent } from "./ics";

type EventGroup = {
  id: string;
  name: string;
  timezone: string;
  duration_minutes: number;
  online_link: string | null;
};

type EventMeeting = {
  originalDate: string;
  date: string;
  startTime: string;
  skipped: boolean;
  game: string | null;
  location: string | null;
  notes: string | null;
};

/** Trasforma un incontro in evento per i calendari (Google, Apple, Outlook). */
export function meetingToEvent(
  group: EventGroup,
  meeting: EventMeeting,
  siteUrl: string,
  m: Messages,
  options: { guest?: boolean } = {},
): CalendarEvent {
  const url = `${siteUrl}/groups/${group.id}/${meeting.originalDate}`;
  const title = [
    `🎲 ${group.name}`,
    meeting.game ? `· ${meeting.game}` : null,
    options.guest ? m.events.icsGuest : null,
  ]
    .filter(Boolean)
    .join(" ");
  const description = [
    meeting.game ? `${m.events.icsGame}: ${meeting.game}` : null,
    meeting.notes,
    group.online_link,
    `${m.events.icsOpen}: ${url}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    uid: `${group.id}-${meeting.originalDate}@schednd`,
    title,
    description,
    location: meeting.location ?? group.online_link,
    url,
    date: meeting.date,
    time: meeting.startTime,
    timeZone: group.timezone,
    durationMinutes: group.duration_minutes || 180,
    cancelled: meeting.skipped,
  };
}
