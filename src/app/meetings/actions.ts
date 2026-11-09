"use server";

import { afterMutation } from "@/lib/revalidate";
import { requireUser } from "@/lib/auth";
import { getString, isDate, type FormState, type NavResult } from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import type { AttendanceStatus } from "@/lib/meetings";

const STATUSES: AttendanceStatus[] = ["yes", "no", "maybe"];

/** Segna (o toglie, con status null) la mia presenza a un incontro. */
export async function setAttendance(
  groupId: string,
  originalDate: string,
  status: AttendanceStatus | null,
  note?: string | null,
): Promise<FormState> {
  const { m } = await getI18n();
  if (!isDate(originalDate) || (status !== null && !STATUSES.includes(status))) {
    return { error: m.errors.invalidRequest };
  }
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_attendance", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_status: status,
    p_note: note ?? null,
  });
  if (error) {
    console.error("set_attendance", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return {};
}

export async function saveAttendanceNote(
  groupId: string,
  originalDate: string,
  status: AttendanceStatus,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { m } = await getI18n();
  const note = getString(formData, "note");
  if (note.length > 200) return { error: m.meetingForms.noteTooLong };
  const result = await setAttendance(groupId, originalDate, status, note);
  return result.error ? result : { success: m.meetingForms.noteSaved };
}

export async function updateOccurrence(
  groupId: string,
  originalDate: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { m } = await getI18n();
  const status = getString(formData, "status") === "skipped" ? "skipped" : "scheduled";
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("update_occurrence", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_status: status,
    p_game_title_override: getString(formData, "game_title_override"),
    p_location_override: getString(formData, "location_override"),
    p_notes: getString(formData, "notes"),
  });
  if (error) {
    console.error("update_occurrence", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: m.meetingForms.updated };
}

/** L'owner sposta data/ora di un singolo incontro. */
export async function moveOccurrence(
  groupId: string,
  originalDate: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { m } = await getI18n();
  const date = getString(formData, "date");
  const time = getString(formData, "time");
  if (!isDate(date)) return { error: m.events.errorDate };
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return { error: m.events.errorTime };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("move_occurrence", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_new_date: date,
    p_new_time: time,
  });
  if (error) {
    console.error("move_occurrence", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: m.events.moved };
}

/** L'owner elimina un incontro straordinario. */
export async function deleteExtraMeeting(groupId: string, originalDate: string): Promise<NavResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("delete_extra_meeting", {
    p_group_id: groupId,
    p_original_date: originalDate,
  });
  afterMutation();
  if (error) {
    console.error("delete_extra_meeting", error);
    return { error: await dbErrorMessage(error) };
  }
  return { redirectTo: `/groups/${groupId}` };
}
