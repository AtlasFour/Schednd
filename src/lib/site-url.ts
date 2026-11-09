import { headers } from "next/headers";

/**
 * Indirizzo del sito da cui arriva la richiesta (es. https://schednd.vercel.app).
 * Serve per costruire il link di accesso inviato via email, così funziona
 * sia in produzione sia nelle anteprime di Vercel sia in locale.
 */
export async function getSiteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
