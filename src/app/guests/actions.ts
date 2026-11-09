"use server";

import { requireUser } from "@/lib/auth";
import {isDate, type NavResult} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import { afterMutation } from "@/lib/revalidate";
import { getSiteUrl } from "@/lib/site-url";

export type GuestLinkResult = { url?: string; error?: string };

async function guestLink(
  rpc: "get_guest_invite" | "regenerate_guest_invite",
  groupId: string,
  originalDate: string,
): Promise<GuestLinkResult> {
  if (!isDate(originalDate)) return { error: (await getI18n()).m.errors.invalidRequest };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(rpc, {
    p_group_id: groupId,
    p_original_date: originalDate,
  });
  if (error || !data) {
    console.error(rpc, error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { url: `${await getSiteUrl()}/ospite/${data}` };
}

export async function getGuestInviteLink(groupId: string, originalDate: string) {
  return guestLink("get_guest_invite", groupId, originalDate);
}

export async function regenerateGuestInviteLink(groupId: string, originalDate: string) {
  return guestLink("regenerate_guest_invite", groupId, originalDate);
}

export async function acceptGuestInvite(token: string): Promise<NavResult> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_guest_invite", { p_token: token });
  const row = (data as { group_id: string; original_date: string }[] | null)?.[0];
  if (error || !row) {
    console.error("accept_guest_invite", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { redirectTo: `/groups/${row.group_id}/${row.original_date}` };
}

export async function removeGuest(
  groupId: string,
  originalDate: string,
  userId: string,
  leaving = false,
): Promise<NavResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_guest", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_user_id: userId,
  });
  afterMutation();
  if (error) {
    console.error("remove_guest", error);
    return { error: await dbErrorMessage(error) };
  }
  return leaving ? { redirectTo: "/" } : {};
}

export async function promoteGuest(groupId: string, userId: string): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("promote_guest", {
    p_group_id: groupId,
    p_user_id: userId,
  });
  if (error) console.error("promote_guest", error);
  afterMutation();
}
