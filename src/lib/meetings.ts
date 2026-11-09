import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRow, ScheduleRow } from "./groups";
import { toSchedule } from "./groups";
import { scheduledTimeFor, todayInTimeZone, upcomingDates } from "./schedule";

export type AttendanceStatus = "yes" | "no" | "maybe";

export const ATTENDANCE_LABELS: Record<AttendanceStatus, { label: string; emoji: string }> = {
  yes: { label: "Ci sono", emoji: "✅" },
  maybe: { label: "Forse", emoji: "❔" },
  no: { label: "Non ci sono", emoji: "❌" },
};

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
};

export const OCCURRENCE_SELECT =
  "id, group_id, original_date, start_date, start_time, status, game_title_override, location_override, notes, attendances(user_id, status, note), proposals(id, type, status, ballots(user_id))";

export type MeetingGroup = Pick<
  GroupRow,
  "id" | "name" | "timezone" | "default_game_title" | "default_location" | "min_attendees"
> & {
  group_schedules: ScheduleRow[];
  memberCount: number;
};

export type Meeting = {
  groupId: string;
  groupName: string;
  /** Data prevista dalla ricorrenza: identifica l'incontro negli URL. */
  originalDate: string;
  date: string;
  startTime: string;
  skipped: boolean;
  game: string | null;
  location: string | null;
  notes: string | null;
  attendances: AttendanceRow[];
  counts: Record<AttendanceStatus, number> & { noAnswer: number };
  minAttendees: number | null;
  memberCount: number;
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
    game: occurrence?.game_title_override ?? group.default_game_title,
    location: occurrence?.location_override ?? group.default_location,
    notes: occurrence?.notes ?? null,
    attendances,
    counts: countAttendances(attendances, group.memberCount),
    minAttendees: group.min_attendees,
    memberCount: group.memberCount,
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

/** Prossimi `count` incontri di un gruppo, con le presenze. */
export function upcomingMeetings(
  group: MeetingGroup,
  occurrences: OccurrenceRow[],
  userId: string,
  count: number,
): Meeting[] {
  const today = todayInTimeZone(group.timezone);
  const byDate = new Map(
    occurrences.filter((o) => o.group_id === group.id).map((o) => [o.original_date, o]),
  );
  return upcomingDates(group.group_schedules.map(toSchedule), today, count).map((d) =>
    buildMeeting(group, d.date, d.startTime, byDate.get(d.date), userId, today),
  );
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
    .gte("original_date", fromDate);
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
