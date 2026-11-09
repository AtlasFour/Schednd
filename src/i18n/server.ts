import { cookies, headers } from "next/headers";
import { cache } from "react";
import { isLocale, LOCALE_COOKIE, localeFromAcceptLanguage, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

/**
 * Lingua della richiesta: quella scelta su questo dispositivo (cookie),
 * altrimenti quella preferita dal browser. Solo sul server.
 */
export const getI18n = cache(async (): Promise<{ locale: Locale; m: Messages }> => {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie)
    ? fromCookie
    : localeFromAcceptLanguage((await headers()).get("accept-language"));
  return { locale, m: MESSAGES[locale] };
});

/** Messaggio leggibile a partire da un errore di Supabase/Postgres. */
export async function dbErrorMessage(error: { message?: string; code?: string } | null) {
  const { m } = await getI18n();
  if (!error) return m.errors.unknown;
  // Le funzioni SQL dell'app sollevano messaggi già scritti per l'utente (P0001).
  if (error.code === "P0001" && error.message) return m.errors.db[error.message] ?? error.message;
  if (error.code === "23514") return m.errors.invalidValues;
  return m.errors.generic;
}
