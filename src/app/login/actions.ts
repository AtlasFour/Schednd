"use server";

import { getI18n } from "@/i18n/server";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/site-url";

export type LoginState =
  | { status: "idle" }
  | { status: "sent"; email: string }
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
