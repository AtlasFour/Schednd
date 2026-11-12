"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { getString, type FormState } from "@/lib/form";
import { getPublicSiteUrl } from "@/lib/notifications/config";
import { afterMutation } from "@/lib/revalidate";
import { getSupabaseEnv } from "@/lib/supabase/env";

type Status = "approved" | "blocked" | "pending";

export async function setAccess(email: string, status: Status): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { error } = await supabase.rpc("admin_set_access", { p_email: email, p_status: status });
  if (error) return { error: await dbErrorMessage(error) };
  afterMutation();
  if (status !== "approved") return { success: m.access.saved };
  return (await sendLoginEmail(email)) ? { success: m.access.approvedSent } : { success: m.access.approvedNoMail };
}

export async function deleteAccess(email: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { error } = await supabase.rpc("admin_delete_access", { p_email: email });
  if (error) return { error: await dbErrorMessage(error) };
  afterMutation();
  return { success: m.access.saved };
}

export async function addApprovedEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  return setAccess(getString(formData, "email").toLowerCase(), "approved");
}

/**
 * Manda all'utente appena approvato l'email per entrare. Si usa un client
 * separato, così non tocca la sessione dell'amministratore.
 */
async function sendLoginEmail(email: string) {
  const env = getSupabaseEnv();
  if (!env) return false;
  const client = createPlainClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${getPublicSiteUrl()}/auth/confirm`, shouldCreateUser: true },
  });
  if (error) console.error("approve signInWithOtp", error.status, error.message);
  return !error;
}
