"use server";

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

  if (!EMAIL_REGEX.test(email)) {
    return { status: "error", message: "Inserisci un indirizzo email valido." };
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
        message:
          "Troppe richieste in poco tempo. Aspetta qualche minuto e riprova.",
      };
    }
    console.error("signInWithOtp", error);
    return {
      status: "error",
      message: "Non è stato possibile inviare l'email. Riprova tra poco.",
    };
  }

  return { status: "sent", email };
}
