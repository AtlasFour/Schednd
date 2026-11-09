"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, isDate } from "@/lib/form";
import { afterMutation } from "@/lib/revalidate";
import { getSiteUrl } from "@/lib/site-url";

export type GuestLinkResult = { url?: string; error?: string };

async function guestLink(
  rpc: "get_guest_invite" | "regenerate_guest_invite",
  groupId: string,
  originalDate: string,
): Promise<GuestLinkResult> {
  if (!isDate(originalDate)) return { error: "Richiesta non valida." };
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc(rpc, {
    p_group_id: groupId,
    p_original_date: originalDate,
  });
  if (error || !data) {
    console.error(rpc, error);
    return { error: dbErrorMessage(error) };
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

export async function acceptGuestInvite(token: string): Promise<void> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_guest_invite", { p_token: token });
  const row = (data as { group_id: string; original_date: string }[] | null)?.[0];
  if (error || !row) {
    console.error("accept_guest_invite", error);
    redirect(`/ospite/${encodeURIComponent(token)}?errore=1`);
  }
  afterMutation();
  redirect(`/groups/${row.group_id}/${row.original_date}`);
}

export async function removeGuest(
  groupId: string,
  originalDate: string,
  userId: string,
  leaving = false,
): Promise<void> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("remove_guest", {
    p_group_id: groupId,
    p_original_date: originalDate,
    p_user_id: userId,
  });
  if (error) console.error("remove_guest", error);
  afterMutation();
  if (leaving && !error) redirect("/");
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
