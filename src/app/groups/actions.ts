"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  dbErrorMessage,
  getOptionalInt,
  getOptionalString,
  getString,
  isDate,
  isTime,
  type FormState,
} from "@/lib/form";
import type { ApprovalRule, GroupMode } from "@/lib/groups";

const MODES: GroupMode[] = ["in_person", "online", "hybrid"];
const RULES: ApprovalRule[] = ["majority", "unanimous_attendees", "owner_decides"];

type GroupFields = {
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
};

function parseGroupFields(formData: FormData): GroupFields | { error: string } {
  const name = getString(formData, "name");
  if (!name) return { error: "Dai un nome al gruppo." };
  if (name.length > 80) return { error: "Il nome può avere al massimo 80 caratteri." };

  const mode = getString(formData, "mode") as GroupMode;
  if (!MODES.includes(mode)) return { error: "Scegli dove si gioca." };

  const approval_rule = getString(formData, "approval_rule") as ApprovalRule;
  if (!RULES.includes(approval_rule)) return { error: "Scegli come si approvano le proposte." };

  const duration_minutes = getOptionalInt(formData, "duration_minutes") ?? 180;
  if (!(duration_minutes >= 15 && duration_minutes <= 1440)) {
    return { error: "Durata non valida." };
  }

  const min_attendees = getOptionalInt(formData, "min_attendees");
  if (min_attendees !== null && !(min_attendees >= 1 && min_attendees <= 100)) {
    return { error: "Il minimo di presenti deve essere un numero tra 1 e 100." };
  }

  const timezone = getString(formData, "timezone") || "Europe/Rome";

  const online_link = getOptionalString(formData, "online_link");
  if (online_link && !/^https?:\/\//i.test(online_link)) {
    return { error: "Il link online deve iniziare con https://" };
  }

  return {
    name,
    description: getOptionalString(formData, "description"),
    mode,
    default_location: getOptionalString(formData, "default_location"),
    online_link,
    timezone,
    duration_minutes,
    default_game_title: getOptionalString(formData, "default_game_title"),
    min_attendees,
    approval_rule,
  };
}

function parseSchedule(formData: FormData) {
  const anchorDate = getString(formData, "anchor_date");
  const startTime = getString(formData, "start_time");
  const intervalWeeks = getOptionalInt(formData, "interval_weeks") ?? 1;

  if (!isDate(anchorDate)) return { error: "Scegli la data del primo incontro." };
  if (!isTime(startTime)) return { error: "Scegli l'orario di inizio." };
  if (!(intervalWeeks >= 1 && intervalWeeks <= 12)) {
    return { error: "Frequenza non valida." };
  }
  return { anchorDate, startTime, intervalWeeks };
}

export async function createGroup(_prev: FormState, formData: FormData): Promise<FormState> {
  const fields = parseGroupFields(formData);
  if ("error" in fields) return { error: fields.error };
  const schedule = parseSchedule(formData);
  if ("error" in schedule) return { error: schedule.error };

  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("create_group", {
    p_name: fields.name,
    p_anchor_date: schedule.anchorDate,
    p_interval_weeks: schedule.intervalWeeks,
    p_start_time: schedule.startTime,
    p_description: fields.description,
    p_mode: fields.mode,
    p_default_location: fields.default_location,
    p_online_link: fields.online_link,
    p_timezone: fields.timezone,
    p_duration_minutes: fields.duration_minutes,
    p_default_game_title: fields.default_game_title,
    p_min_attendees: fields.min_attendees,
    p_approval_rule: fields.approval_rule,
  });

  if (error || !data) {
    console.error("create_group", error);
    return { error: dbErrorMessage(error) };
  }

  redirect(`/groups/${data}?nuovo=1`);
}

export async function updateGroup(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const fields = parseGroupFields(formData);
  if ("error" in fields) return { error: fields.error };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("groups")
    .update(fields)
    .eq("id", groupId)
    .select("id");

  if (error) {
    console.error("updateGroup", error);
    return { error: dbErrorMessage(error) };
  }
  if (!data?.length) {
    return { error: "Solo l'owner può modificare il gruppo." };
  }

  refresh();
  return { success: "Modifiche salvate." };
}

export async function changeSchedule(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const schedule = parseSchedule(formData);
  if ("error" in schedule) return { error: schedule.error };

  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("change_schedule", {
    p_group_id: groupId,
    p_anchor_date: schedule.anchorDate,
    p_interval_weeks: schedule.intervalWeeks,
    p_start_time: schedule.startTime,
  });

  if (error) {
    console.error("change_schedule", error);
    return { error: dbErrorMessage(error) };
  }

  refresh();
  return { success: "Ricorrenza aggiornata." };
}

export async function regenerateInviteCode(groupId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_group_id: groupId });
  if (error) console.error("regenerate_invite_code", error);
  refresh();
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) console.error("removeMember", error);
  refresh();
}

export async function transferOwnership(groupId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_group_id: groupId,
    p_new_owner: userId,
  });
  if (error) {
    console.error("transfer_ownership", error);
    refresh();
    return;
  }
  // Non essendo più owner, le impostazioni non sono più accessibili.
  redirect(`/groups/${groupId}`);
}

export async function deleteGroup(groupId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  if (error) {
    console.error("deleteGroup", error);
    refresh();
    return;
  }
  redirect("/");
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);
  if (error) {
    console.error("leaveGroup", error);
    refresh();
    return;
  }
  redirect("/");
}

export async function joinGroup(code: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error || !data) {
    console.error("join_group", error);
    redirect(`/join/${encodeURIComponent(code)}?errore=1`);
  }
  redirect(`/groups/${data}`);
}

export async function goToInviteCode(formData: FormData): Promise<void> {
  const raw = getString(formData, "code");
  // Accetta sia il codice sia il link completo.
  const code = raw.split("/").filter(Boolean).pop()?.toUpperCase() ?? "";
  if (!code) redirect("/");
  redirect(`/join/${encodeURIComponent(code)}`);
}
