"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";
import { useI18n } from "@/i18n/client";

/** Errore imprevisto in una pagina: messaggio tradotto e pulsante "Riprova". */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const { m } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return <ErrorView m={m} retry={retry} />;
}
