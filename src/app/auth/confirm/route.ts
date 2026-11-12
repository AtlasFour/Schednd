import { NextResponse, type NextRequest } from "next/server";
import { completeLogin } from "@/lib/login-complete";
import { createClient } from "@/lib/supabase/server";

/**
 * Destinazione del link di accesso inviato via email.
 *
 * - `?token_hash=...&type=email` (modello email consigliato): rimanda alla
 *   pagina /auth/accedi, dove si conferma con un tocco. Così i programmi di
 *   posta che aprono i link da soli per controllarli non "consumano" l'accesso.
 * - `?code=...` (formato predefinito di Supabase): funziona solo nello stesso
 *   browser in cui è stato richiesto il link.
 * - `?error_code=...`: Supabase segnala un link scaduto o già usato.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const errorCode = searchParams.get("error_code");

  if (tokenHash) {
    const url = new URL("/auth/accedi", origin);
    url.search = searchParams.toString();
    return NextResponse.redirect(url);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const result = await completeLogin(supabase, searchParams.get("next"));
      const target = "next" in result ? result.next : `/login?errore=${result.blocked}`;
      return NextResponse.redirect(new URL(target, origin));
    }
    console.error("exchangeCodeForSession", error.code, error.message);
    // Di solito succede quando il link viene aperto in un browser diverso
    // da quello in cui è stato richiesto (es. il browser interno di Gmail).
    return NextResponse.redirect(new URL("/login?errore=altro_browser", origin));
  }

  const reason = errorCode === "otp_expired" ? "scaduto" : "link_non_valido";
  return NextResponse.redirect(new URL(`/login?errore=${reason}`, origin));
}

