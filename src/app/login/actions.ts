"use server";

import { getI18n } from "@/i18n/server";
import { redirect } from "next/navigation";
import { completeLogin } from "@/lib/login-complete";
import { after } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/process";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string; codeError?: string }
  | { status: "pending"; email: string }
  | { status: "error"; message: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const { m } = await getI18n();
  if (!EMAIL_REGEX.test(email)) {
    return { status: "error", message: m.login.errorEmail };
  }

  // Accesso su approvazione: ogni tentativo viene registrato e solo le email
  // approvate ricevono il link (senza la chiave di servizio si salta il controllo).
  const admin = createAdminClient();
  if (admin) {
    const { data: access, error: accessError } = await admin.rpc("register_access_attempt", { p_email: email });
    if (accessError) console.error("register_access_attempt", accessError);
    else if (access === "blocked") return { status: "error", message: m.access.blocked };
    else if (access === "pending") {
      // Avvisa subito gli amministratori della nuova richiesta.
      after(() => processNotificationQueue().catch((err) => console.error(err)));
      return { status: "pending", email };
    }
  }

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/confirm`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    if (error.status === 429) {
      return {
        status: "error",
        message: m.login.errorRateLimit,
      };
    }
    console.error("signInWithOtp", error);
    return {
      status: "error",
      message: m.login.errorSend,
    };
  }

  return { status: "sent", email };
}

/** Accesso con il codice numerico dell'email (funziona da qualsiasi app o browser). */
export async function verifyEmailCode(prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\D/g, "");
  const { m } = await getI18n();
  if (!EMAIL_REGEX.test(email) || token.length < 6) {
    return { status: "sent", email, codeError: m.login.codeInvalid };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) {
    console.error("verifyOtp code", error.code, error.message);
    return { status: "sent", email, codeError: m.login.codeInvalid };
  }
  const next = await completeLogin(supabase);
  if (!next) return { status: "sent", email, codeError: m.access.errorPending };
  redirect(next);
}
