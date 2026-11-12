"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { getString, type FormState } from "@/lib/form";
import { getPublicSiteUrl } from "@/lib/notifications/config";
import { afterMutation } from "@/lib/revalidate";
import { createAdminClient } from "@/lib/supabase/admin";
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

/** Rimanda l'email di accesso a una persona già approvata. */
export async function resendLoginEmail(email: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  if (!isAdmin) return { error: m.access.notAdmin };
  return (await sendLoginEmail(email)) ? { success: m.access.resent } : { error: m.access.resendFailed };
}

/**
 * Link di accesso da mandare a mano (WhatsApp, Telegram...): chi lo apre entra
 * senza email né codice. Vale una volta sola e scade come i link delle email.
 * L'email viene anche approvata, se non lo era.
 */
export async function createLoginLink(email: string): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  if (!isAdmin) return { error: m.access.notAdmin };
  const admin = createAdminClient();
  if (!admin) return { error: m.access.linkFailed };

  const { error: approveError } = await supabase.rpc("admin_set_access", { p_email: email, p_status: "approved" });
  if (approveError) return { error: await dbErrorMessage(approveError) };

  let result = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (result.error) {
    // Account non ancora creato: lo creiamo (email già confermata) e riproviamo.
    await admin.auth.admin.createUser({ email, email_confirm: true });
    result = await admin.auth.admin.generateLink({ type: "magiclink", email });
  }
  const hashed = result.data?.properties?.hashed_token;
  if (result.error || !hashed) {
    console.error("generateLink", result.error?.status, result.error?.message);
    return { error: m.access.linkFailed };
  }
  afterMutation();
  return { url: `${getPublicSiteUrl()}/auth/accedi?token_hash=${encodeURIComponent(hashed)}&type=magiclink` };
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
