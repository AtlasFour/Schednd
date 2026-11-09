import type { SupabaseClient } from "@supabase/supabase-js";
import { getGroupDetail, type GroupRow, type ScheduleRow } from "./groups";

export type ParticipantRole = "owner" | "member" | "guest";

export type Participant = {
  user_id: string;
  name: string;
  role: ParticipantRole;
};

export type MeetingContextGroup = Pick<
  GroupRow,
  | "id"
  | "name"
  | "mode"
  | "default_location"
  | "online_link"
  | "timezone"
  | "default_game_title"
  | "min_attendees"
  | "approval_rule"
> & { group_schedules: ScheduleRow[] };

export type MeetingContext = {
  viewer: ParticipantRole;
  group: MeetingContextGroup;
  /** Membri del gruppo + ospiti dell'incontro. */
  participants: Participant[];
  memberCount: number;
};

function sortParticipants(list: Participant[]) {
  const order: Record<ParticipantRole, number> = { owner: 0, member: 1, guest: 2 };
  return list.sort(
    (a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name, "it"),
  );
}

/**
 * Dati necessari alla pagina di un incontro, sia per i membri del gruppo sia
 * per gli ospiti (che non possono leggere direttamente gruppo e membri).
 * Restituisce null se l'utente non partecipa all'incontro.
 */
export async function getMeetingContext(
  supabase: SupabaseClient,
  groupId: string,
  originalDate: string,
  userId: string,
): Promise<MeetingContext | null> {
  const group = await getGroupDetail(supabase, groupId);

  if (group) {
    const { data: guests } = await supabase
      .from("occurrences")
      .select("occurrence_guests(user_id, profiles(display_name))")
      .eq("group_id", groupId)
      .eq("original_date", originalDate)
      .maybeSingle();

    const guestRows =
      (guests as {
        occurrence_guests: { user_id: string; profiles: { display_name: string } | null }[];
      } | null)?.occurrence_guests ?? [];

    const participants: Participant[] = [
      ...group.memberships.map((m) => ({
        user_id: m.user_id,
        name: m.profiles?.display_name ?? "Utente",
        role: m.role,
      })),
      ...guestRows.map((g) => ({
        user_id: g.user_id,
        name: g.profiles?.display_name ?? "Ospite",
        role: "guest" as const,
      })),
    ];
    const me = group.memberships.find((m) => m.user_id === userId);

    return {
      viewer: me?.role ?? "member",
      group,
      participants: sortParticipants(participants),
      memberCount: group.memberships.length,
    };
  }

  const { data, error } = await supabase.rpc("get_guest_context", {
    p_group_id: groupId,
    p_original_date: originalDate,
  });
  if (error) {
    console.error("get_guest_context", error);
    return null;
  }
  if (!data) return null;

  const ctx = data as { group: MeetingContextGroup; participants: Participant[] };
  return {
    viewer: "guest",
    group: ctx.group,
    participants: sortParticipants(ctx.participants),
    memberCount: ctx.participants.filter((p) => p.role !== "guest").length,
  };
}
