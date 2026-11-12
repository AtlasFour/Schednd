import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRow, ScheduleRow } from "./groups";
import { toSchedule } from "./groups";
import { addDays, scheduledTimeFor, todayInTimeZone, upcomingDates } from "./schedule";

export type AttendanceStatus = "yes" | "no" | "maybe";

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ["yes", "maybe", "no"];

export type AttendanceRow = {
  user_id: string;
  status: AttendanceStatus;
  note: string | null;
};

export type OccurrenceProposalSummary = {
  id: string;
  type: "reschedule" | "skip" | "change_game";
  status: "open" | "needs_owner" | "approved" | "rejected" | "cancelled";
  ballots: { user_id: string }[];
};

export type OccurrenceRow = {
  id: string;
  group_id: string;
  original_date: string;
  start_date: string;
  start_time: string;
  status: "scheduled" | "skipped";
  game_title_override: string | null;
  location_override: string | null;
  notes: string | null;
  attendances: AttendanceRow[];
  proposals?: OccurrenceProposalSummary[];
  occurrence_guests?: { user_id: string }[];
  is_extra?: boolean;
};

export const OCCURRENCE_SELECT =
  "id, group_id, original_date, start_date, start_time, status, game_title_override, location_override, notes, attendances(user_id, status, note), proposals(id, type, status, ballots(user_id)), occurrence_guests(user_id), is_extra";

export type MeetingGroup = Pick<
  GroupRow,
  "id" | "name" | "timezone" | "default_game_title" | "default_location" | "min_attendees"
> & {
  group_schedules: ScheduleRow[];
  memberCount: number;
  kind?: "recurring" | "single";
};

export type Meeting = {
  groupId: string;
  groupName: string;
  /** Data prevista dalla ricorrenza: identifica l'incontro negli URL. */
  originalDate: string;
  date: string;
  startTime: string;
  skipped: boolean;
  /** Incontro fuori ricorrenza (straordinario o evento singolo). */
  isExtra: boolean;
  /** Il gruppo è un evento singolo. */
  isSingle: boolean;
  game: string | null;
  location: string | null;
  notes: string | null;
  attendances: AttendanceRow[];
  counts: Record<AttendanceStatus, number> & { noAnswer: number };
  minAttendees: number | null;
  /** Membri del gruppo + ospiti dell'incontro. */
  memberCount: number;
  guestCount: number;
  myStatus: AttendanceStatus | null;
  myNote: string | null;
  today: string;
  /** Proposte aperte a cui non ho ancora votato. */
  proposalsToVote: number;
  /** Proposte in pareggio (le decide l'owner). */
  proposalsTied: number;
  openProposals: number;
};

export function countAttendances(attendances: AttendanceRow[], memberCount: number) {
  const counts = { yes: 0, maybe: 0, no: 0, noAnswer: 0 };
  for (const a of attendances) counts[a.status] += 1;
  counts.noAnswer = Math.max(0, memberCount - attendances.length);
  return counts;
}

export function buildMeeting(
  group: MeetingGroup,
  originalDate: string,
  startTime: string,
  occurrence: OccurrenceRow | undefined,
  userId: string,
  today: string,
): Meeting {
  const attendances = occurrence?.attendances ?? [];
  const guestCount = occurrence?.occurrence_guests?.length ?? 0;
  const participants = group.memberCount + guestCount;
  const mine = attendances.find((a) => a.user_id === userId);
  const open = (occurrence?.proposals ?? []).filter(
    (p) => p.status === "open" || p.status === "needs_owner",
  );
  return {
    groupId: group.id,
    groupName: group.name,
    originalDate,
    date: occurrence?.start_date ?? originalDate,
    startTime: occurrence?.start_time ?? startTime,
    skipped: occurrence?.status === "skipped",
    isExtra: occurrence?.is_extra ?? false,
    isSingle: group.kind === "single",
    game: occurrence?.game_title_override ?? group.default_game_title,
    location: occurrence?.location_override ?? group.default_location,
    notes: occurrence?.notes ?? null,
    attendances,
    counts: countAttendances(attendances, participants),
    minAttendees: group.min_attendees,
    memberCount: participants,
    guestCount,
    myStatus: mine?.status ?? null,
    myNote: mine?.note ?? null,
    today,
    proposalsToVote: open.filter(
      (p) => p.status === "open" && !p.ballots.some((b) => b.user_id === userId),
    ).length,
    proposalsTied: open.filter((p) => p.status === "needs_owner").length,
    openProposals: open.length,
  };
}

/**
 * Prossimi `count` incontri di un gruppo (da oggi), con le presenze.
 * Usa la data effettiva: un incontro rinviato compare nella nuova data anche
 * se la data originale è già passata.
 */
export function upcomingMeetings(
  group: MeetingGroup,
  occurrences: OccurrenceRow[],
  userId: string,
  count: number,
): Meeting[] {
  const today = todayInTimeZone(group.timezone);
  // Un anno basta per trovare i prossimi incontri anche con ricorrenze rade.
  return meetingsBetween(group, occurrences, userId, today, addDays(today, 366))
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
    .slice(0, count);
}

/**
 * Incontri di un gruppo con data effettiva tra `from` e `to` (comprese),
 * anche passati. Considera gli incontri spostati da/verso il periodo.
 */
export function meetingsBetween(
  group: MeetingGroup,
  occurrences: OccurrenceRow[],
  userId: string,
  from: string,
  to: string,
): Meeting[] {
  const today = todayInTimeZone(group.timezone);
  const mine = occurrences.filter((o) => o.group_id === group.id);
  const byDate = new Map(mine.map((o) => [o.original_date, o]));
  // Si parte un mese prima per includere gli incontri spostati in avanti.
  const start = addDays(from, -31);
  const span = Math.round((Date.parse(to) - Date.parse(start)) / 86_400_000) + 1;
  const scheduled = upcomingDates(group.group_schedules.map(toSchedule), start, span).filter(
    (d) => d.date <= to,
  );
  const seen = new Set(scheduled.map((d) => d.date));
  const meetings = scheduled.map((d) =>
    buildMeeting(group, d.date, d.startTime, byDate.get(d.date), userId, today),
  );
  // Incontri spostati la cui data originale è fuori dal periodo calcolato.
  for (const o of mine) {
    if (!seen.has(o.original_date) && o.start_date >= from && o.start_date <= to) {
      meetings.push(buildMeeting(group, o.original_date, o.start_time, o, userId, today));
    }
  }
  return meetings.filter((m) => m.date >= from && m.date <= to);
}

/** Singolo incontro per data; undefined se in quella data non è previsto. */
export function meetingForDate(
  group: MeetingGroup,
  originalDate: string,
  occurrence: OccurrenceRow | undefined,
  userId: string,
): Meeting | undefined {
  const time =
    occurrence?.start_time ??
    scheduledTimeFor(group.group_schedules.map(toSchedule), originalDate);
  if (!time) return undefined;
  return buildMeeting(
    group,
    originalDate,
    time,
    occurrence,
    userId,
    todayInTimeZone(group.timezone),
  );
}

export async function fetchOccurrences(
  supabase: SupabaseClient,
  groupIds: string[],
  fromDate: string,
): Promise<OccurrenceRow[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from("occurrences")
    .select(OCCURRENCE_SELECT)
    .in("group_id", groupIds)
    // Anche gli incontri con data originale precedente ma spostati in avanti.
    .or(`original_date.gte.${fromDate},start_date.gte.${fromDate}`);
  if (error) {
    console.error("fetchOccurrences", error);
    return [];
  }
  return (data ?? []) as OccurrenceRow[];
}

/** Stato del minimo presenti: null se il gruppo non ha un minimo. */
export function minimumStatus(meeting: Pick<Meeting, "counts" | "minAttendees">) {
  if (!meeting.minAttendees) return null;
  const missing = meeting.minAttendees - meeting.counts.yes;
  return missing <= 0
    ? ({ reached: true, missing: 0 } as const)
    : ({ reached: false, missing } as const);
}
