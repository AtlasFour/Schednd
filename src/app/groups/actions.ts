"use server";

import { afterMutation } from "@/lib/revalidate";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import type { Messages } from "@/i18n/messages";
import {
  getOptionalInt,
  getOptionalString,
  getString,
  isDate,
  isTime,
  type FormState, type NavResult,
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

function parseGroupFields(formData: FormData, m: Messages): GroupFields | { error: string } {
  const name = getString(formData, "name");
  if (!name) return { error: m.groupActions.nameRequired };
  if (name.length > 80) return { error: m.groupActions.nameTooLong };

  const mode = getString(formData, "mode") as GroupMode;
  if (!MODES.includes(mode)) return { error: m.groupActions.modeRequired };

  const approval_rule = getString(formData, "approval_rule") as ApprovalRule;
  if (!RULES.includes(approval_rule)) return { error: m.groupActions.ruleRequired };

  const duration_minutes = getOptionalInt(formData, "duration_minutes") ?? 180;
  if (!(duration_minutes >= 15 && duration_minutes <= 1440)) {
    return { error: m.groupActions.invalidDuration };
  }

  const min_attendees = getOptionalInt(formData, "min_attendees");
  if (min_attendees !== null && !(min_attendees >= 1 && min_attendees <= 100)) {
    return { error: m.groupActions.invalidMin };
  }

  const timezone = getString(formData, "timezone") || "Europe/Rome";

  const online_link = getOptionalString(formData, "online_link");
  if (online_link && !/^https?:\/\//i.test(online_link)) {
    return { error: m.groupActions.invalidLink };
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

function parseSchedule(formData: FormData, m: Messages) {
  const anchorDate = getString(formData, "anchor_date");
  const startTime = getString(formData, "start_time");
  const intervalWeeks = getOptionalInt(formData, "interval_weeks") ?? 1;

  if (!isDate(anchorDate)) return { error: m.groupActions.firstDateRequired };
  if (!isTime(startTime)) return { error: m.groupActions.timeRequired };
  if (!(intervalWeeks >= 1 && intervalWeeks <= 12)) {
    return { error: m.groupActions.invalidFrequency };
  }
  return { anchorDate, startTime, intervalWeeks };
}

export async function createGroup(_prev: NavResult, formData: FormData): Promise<NavResult> {
  const { m } = await getI18n();
  const fields = parseGroupFields(formData, m);
  if ("error" in fields) return { error: fields.error };
  const schedule = parseSchedule(formData, m);
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
    return { error: await dbErrorMessage(error) };
  }

  afterMutation();
  return { redirectTo: `/groups/${data}?nuovo=1` };
}

export async function updateGroup(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { m } = await getI18n();
  const fields = parseGroupFields(formData, m);
  if ("error" in fields) return { error: fields.error };

  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("groups")
    .update(fields)
    .eq("id", groupId)
    .select("id");

  if (error) {
    console.error("updateGroup", error);
    return { error: await dbErrorMessage(error) };
  }
  if (!data?.length) {
    return { error: m.groupActions.onlyOwnerEdit };
  }

  afterMutation();
  return { success: m.groupActions.saved };
}

export async function changeSchedule(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { m } = await getI18n();
  const schedule = parseSchedule(formData, m);
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
    return { error: await dbErrorMessage(error) };
  }

  afterMutation();
  return { success: m.groupActions.scheduleUpdated };
}

export async function regenerateInviteCode(groupId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("regenerate_invite_code", { p_group_id: groupId });
  if (error) console.error("regenerate_invite_code", error);
  afterMutation();
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) console.error("removeMember", error);
  afterMutation();
}

export async function transferOwnership(groupId: string, userId: string): Promise<NavResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_group_id: groupId,
    p_new_owner: userId,
  });
  afterMutation();
  if (error) {
    console.error("transfer_ownership", error);
    return { error: await dbErrorMessage(error) };
  }
  // Non essendo più owner, le impostazioni non sono più accessibili.
  return { redirectTo: `/groups/${groupId}` };
}

export async function deleteGroup(groupId: string): Promise<NavResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("groups").delete().eq("id", groupId);
  afterMutation();
  if (error) {
    console.error("deleteGroup", error);
    return { error: await dbErrorMessage(error) };
  }
  return { redirectTo: "/" };
}

export async function leaveGroup(groupId: string): Promise<NavResult> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("memberships")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);
  afterMutation();
  if (error) {
    console.error("leaveGroup", error);
    return { error: await dbErrorMessage(error) };
  }
  return { redirectTo: "/" };
}

export async function joinGroup(code: string): Promise<NavResult> {
  const { m } = await getI18n();
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("join_group", { p_code: code });
  if (error || !data) {
    console.error("join_group", error);
    return { error: m.groupActions.joinFailed };
  }
  afterMutation();
  return { redirectTo: `/groups/${data}` };
}

export async function goToInviteCode(formData: FormData): Promise<void> {
  const raw = getString(formData, "code");
  // Accetta sia il codice sia il link completo.
  const code = raw.split("/").filter(Boolean).pop()?.toUpperCase() ?? "";
  if (!code) redirect("/");
  redirect(`/join/${encodeURIComponent(code)}`);
}
