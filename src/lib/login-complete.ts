import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "@/i18n/config";
import { NEXT_PATH_COOKIE, safeNextPath } from "@/lib/next-path";

/**
 * Dopo un accesso riuscito (link o codice): lingua dell'account salvata nel
 * cookie e pagina a cui tornare. Da chiamare in Server Actions e Route Handlers.
 * Se l'email non è (ancora) approvata, o il controllo non riesce, la sessione
 * viene chiusa e si restituisce il motivo.
 */
export async function completeLogin(
  supabase: SupabaseClient,
  nextParam?: string | null,
): Promise<{ next: string } | { blocked: "in_attesa" | "verifica" }> {
  // L'accesso è su approvazione: chi non è approvato (o se il controllo non
  // riesce) viene fatto uscire.
  const { data: access, error } = await supabase.rpc("my_access_status");
  if (error || access !== "approved") {
    if (error) console.error("my_access_status", error);
    await supabase.auth.signOut();
    return { blocked: error ? "verifica" : "in_attesa" };
  }

  const cookieStore = await cookies();
  const next =
    safeNextPath(nextParam) ?? safeNextPath(cookieStore.get(NEXT_PATH_COOKIE)?.value) ?? "/";
  const locale = await accountLocale(supabase, cookieStore.get(LOCALE_COOKIE)?.value);
  cookieStore.delete(NEXT_PATH_COOKIE);
  cookieStore.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { next };
}

/**
 * Lingua dell'account: quella salvata nel profilo; se non è mai stata scelta,
 * quella di questo dispositivo, che viene salvata nel profilo così anche le
 * notifiche arrivano nella lingua giusta.
 */
async function accountLocale(supabase: SupabaseClient, cookieLocale: string | undefined): Promise<Locale> {
  const fromDevice = isLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage((await headers()).get("accept-language"));
  try {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return fromDevice;
    const { data: profile } = await supabase.from("profiles").select("locale").eq("id", userId).maybeSingle();
    if (isLocale(profile?.locale)) return profile.locale;
    await supabase.from("profiles").update({ locale: fromDevice }).eq("id", userId);
  } catch (err) {
    console.error("accountLocale", err);
  }
  return fromDevice;
}
