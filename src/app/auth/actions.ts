"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { completeLogin } from "@/lib/login-complete";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/** Conferma dell'accesso dal link dell'email (pagina /auth/accedi). */
export async function confirmEmailLink(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const typeParam = String(formData.get("type") ?? "email") as EmailOtpType;
  const type = OTP_TYPES.includes(typeParam) ? typeParam : "email";
  if (!tokenHash) redirect("/login?errore=link_non_valido");

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.error("verifyOtp", error.code, error.message);
    redirect(`/login?errore=${error.code === "otp_expired" ? "scaduto" : "link_non_valido"}`);
  }
  const result = await completeLogin(supabase, String(formData.get("next") ?? "") || null);
  redirect("next" in result ? result.next : `/login?errore=${result.blocked}`);
}
