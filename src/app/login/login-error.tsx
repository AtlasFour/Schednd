"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";

/**
 * Messaggio d'errore dopo un link non riuscito. Supabase a volte indica il
 * motivo nella parte dopo "#" dell'indirizzo (es. link scaduto o già usato),
 * che il server non vede: la leggiamo qui.
 */
export function LoginError({ code }: { code: string | null }) {
  const { m } = useI18n();
  const [hashCode, setHashCode] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const errorCode = params.get("error_code");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (errorCode) setHashCode(errorCode === "otp_expired" ? "scaduto" : "link_non_valido");
  }, []);

  const messages: Record<string, string> = {
    link_non_valido: m.login.errorInvalidLink,
    altro_browser: m.login.errorOtherBrowser,
    scaduto: m.login.errorExpired,
    in_attesa: m.access.errorPending,
    verifica: m.access.checkFailed,
    bloccato: m.access.blocked,
  };
  const message = messages[hashCode ?? code ?? ""];
  if (!message) return null;

  return (
    <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
      {message}
    </p>
  );
}
