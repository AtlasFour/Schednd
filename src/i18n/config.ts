export const LOCALES = ["it", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "it";

/** Cookie con la lingua scelta su questo dispositivo. */
export const LOCALE_COOKIE = "schednd-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Tag per Intl (formattazione di date e numeri). */
export function intlLocale(locale: Locale) {
  return locale === "en" ? "en-GB" : "it-IT";
}

/** Lingua preferita dal browser (intestazione Accept-Language). */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("it")) return "it";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
