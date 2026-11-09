"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { MESSAGES, type Messages } from "./messages";

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Lingua e testi per i componenti che girano nel browser. */
export function useI18n(): { locale: Locale; m: Messages } {
  const locale = useContext(LocaleContext);
  return { locale, m: MESSAGES[locale] };
}
