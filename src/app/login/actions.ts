"use server";

import { getI18n } from "@/i18n/server";
import { redirect } from "next/navigation";
import { completeLogin } from "@/lib/login-complete";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string; codeError?: string }
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
  redirect(await completeLogin(supabase));
}
