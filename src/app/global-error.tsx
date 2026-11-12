"use client";

import { useEffect } from "react";
import { ErrorView } from "@/components/error-view";
import { MESSAGES } from "@/i18n/messages";
import "./globals.css";

/** Errore nel layout principale: pagina minima (italiano, o inglese se il browser lo è). */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  const en = typeof navigator !== "undefined" && !navigator.language.startsWith("it");
  return (
    <html lang={en ? "en" : "it"}>
      <body className="flex min-h-full flex-col">
        <ErrorView m={MESSAGES[en ? "en" : "it"]} retry={retry} />
      </body>
    </html>
  );
}
