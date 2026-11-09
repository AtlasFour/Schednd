import type { ReactNode } from "react";
import { LocaleProvider } from "./client";
import { getI18n } from "./server";

/** Rende disponibile la lingua ai componenti client. */
export async function LocaleBoundary({ children }: { children: ReactNode }) {
  const { locale } = await getI18n();
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>;
}
