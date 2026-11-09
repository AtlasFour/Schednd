import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/i18n/config";
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
      return redirectAfterLogin(next, origin, await accountLocale(supabase, request));
    }
    console.error("verifyOtp", error);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectAfterLogin(next, origin, await accountLocale(supabase, request));
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

function redirectAfterLogin(next: string, origin: string, locale: Locale) {
  const response = NextResponse.redirect(new URL(next, origin));
  response.cookies.delete(NEXT_PATH_COOKIE);
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return response;
}

/**
 * Lingua dell'account: quella salvata nel profilo; se non è mai stata
 * scelta, quella di questo dispositivo (cookie o browser), che viene salvata
 * nel profilo così anche le notifiche arrivano nella lingua giusta.
 */
async function accountLocale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  request: NextRequest,
): Promise<Locale> {
  const fromDevice = (() => {
    const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
    return isLocale(cookie) ? cookie : localeFromAcceptLanguage(request.headers.get("accept-language"));
  })();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return fromDevice;
    const { data: profile } = await supabase
      .from("profiles")
      .select("locale")
      .eq("id", userId)
      .maybeSingle();
    if (isLocale(profile?.locale)) return profile.locale;
    await supabase.from("profiles").update({ locale: fromDevice }).eq("id", userId);
  } catch (err) {
    console.error("accountLocale", err);
  }
  return fromDevice;
}
