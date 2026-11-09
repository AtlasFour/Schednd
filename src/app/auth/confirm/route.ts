import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Destinazione del link di accesso inviato via email.
 *
 * Supporta due formati:
 * - `?token_hash=...&type=email` (consigliato: funziona anche se il link
 *   viene aperto in un browser diverso da quello in cui è stato richiesto);
 * - `?code=...` (formato predefinito di Supabase).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("verifyOtp", error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
    console.error("exchangeCodeForSession", error);
  }

  return NextResponse.redirect(new URL("/login?errore=link_non_valido", origin));
}

/** Accetta solo percorsi interni, per evitare redirect verso altri siti. */
function safeNextPath(next: string | null) {
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/";
}
