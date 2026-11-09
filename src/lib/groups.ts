import type { SupabaseClient } from "@supabase/supabase-js";
import {
  currentSchedule,
  todayInTimeZone,
  upcomingDates,
  type Schedule,
} from "./schedule";

export type GroupMode = "in_person" | "online" | "hybrid";
export type ApprovalRule = "majority" | "unanimous_attendees" | "owner_decides";
export type MemberRole = "owner" | "member";

export const MODE_LABELS: Record<GroupMode, string> = {
  in_person: "Di persona",
  online: "Online",
  hybrid: "Ibrido",
};

export const APPROVAL_RULE_LABELS: Record<ApprovalRule, { label: string; hint: string }> = {
  majority: {
    label: "Maggioranza",
    hint: "Vince l'opzione scelta da più della metà del gruppo. In caso di pareggio decide l'owner.",
  },
  unanimous_attendees: {
    label: "Unanimità dei presenti",
    hint: "Vince un'opzione che va bene a tutti quelli che hanno detto di esserci.",
  },
  owner_decides: {
    label: "Decide l'owner",
    hint: "Tutti votano per dare un parere, ma la scelta finale è dell'owner.",
  },
};

export const INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 8, 12].map((weeks) => ({
  value: weeks,
  label: weeks === 1 ? "Ogni settimana" : `Ogni ${weeks} settimane`,
}));

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? "1 ora" : `${hours} ore`;
  if (rest === 0) return h;
  if (rest === 30) return `${h} e mezza`;
  return hours === 0 ? `${rest} minuti` : `${h} e ${rest} min`;
}

export const DURATION_OPTIONS = [60, 90, 120, 150, 180, 210, 240, 300, 360, 480].map(
  (minutes) => ({ value: minutes, label: formatDuration(minutes) }),
);

export type ScheduleRow = {
  id: string;
  anchor_date: string;
  interval_weeks: number;
  start_time: string;
  valid_until: string | null;
};

export type GroupRow = {
  id: string;
  name: string;
  description: string | null;
  mode: GroupMode;
  default_location: string | null;
  online_link: string | null;
  timezone: string;
  duration_minutes: number;
  default_game_title: string | null;
  min_attendees: number | null;
  approval_rule: ApprovalRule;
  status: "active" | "paused" | "archived";
  invite_code: string;
};

export type MemberRow = {
  user_id: string;
  role: MemberRole;
  joined_at: string;
  profiles: { display_name: string } | null;
};

export type GroupDetail = GroupRow & {
  group_schedules: ScheduleRow[];
  memberships: MemberRow[];
};

export function toSchedule(row: ScheduleRow): Schedule {
  return {
    anchorDate: row.anchor_date,
    intervalWeeks: row.interval_weeks,
    startTime: row.start_time,
    validUntil: row.valid_until,
  };
}

export function nextDates(
  group: Pick<GroupRow, "timezone"> & { group_schedules: ScheduleRow[] },
  count: number,
) {
  const today = todayInTimeZone(group.timezone);
  return {
    today,
    dates: upcomingDates(group.group_schedules.map(toSchedule), today, count),
  };
}

export function activeSchedule(group: { group_schedules: ScheduleRow[] }) {
  const row = currentSchedule(
    group.group_schedules.map((s) => ({ ...s, validUntil: s.valid_until })),
  );
  return row ? toSchedule(row) : undefined;
}

const GROUP_DETAIL_SELECT =
  "id, name, description, mode, default_location, online_link, timezone, duration_minutes, default_game_title, min_attendees, approval_rule, status, invite_code, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(user_id, role, joined_at, profiles(display_name))";

export async function getGroupDetail(supabase: SupabaseClient, groupId: string) {
  const { data, error } = await supabase
    .from("groups")
    .select(GROUP_DETAIL_SELECT)
    .eq("id", groupId)
    .maybeSingle();

  if (error) {
    // ID non valido (non è un UUID) o errore temporaneo.
    console.error("getGroupDetail", error);
    return null;
  }

  if (!data) return null;

  const group = data as unknown as GroupDetail;
  group.memberships.sort((a, b) => {
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1;
    return (a.profiles?.display_name ?? "").localeCompare(
      b.profiles?.display_name ?? "",
      "it",
    );
  });
  return group;
}

export function inviteUrl(siteUrl: string, code: string) {
  return `${siteUrl}/join/${code}`;
}
