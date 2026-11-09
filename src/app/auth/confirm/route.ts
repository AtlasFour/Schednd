import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/next-path";
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
  const next =
    safeNextPath(searchParams.get("next")) ??
    safeNextPath(request.cookies.get(NEXT_PATH_COOKIE)?.value) ??
    "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return redirectAfterLogin(next, origin);
    }
    console.error("verifyOtp", error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterLogin(next, origin);
    }
    console.error("exchangeCodeForSession", error);
    // Di solito succede quando il link viene aperto in un browser diverso
    // da quello in cui è stato richiesto (es. il browser interno di Gmail).
    return NextResponse.redirect(
      new URL("/login?errore=altro_browser", origin),
    );
  }

  return NextResponse.redirect(new URL("/login?errore=link_non_valido", origin));
}

function redirectAfterLogin(next: string, origin: string) {
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete(NEXT_PATH_COOKIE);
  return response;
}
