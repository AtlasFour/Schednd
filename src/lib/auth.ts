import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { USER_HEADER } from "@/lib/supabase/user-header";

/**
 * Restituisce l'utente collegato e un client Supabase.
 * Se l'utente non ha fatto login, lo manda alla pagina di accesso.
 */
export async function requireUser() {
  // Dati legati alla richiesta (sessione, ora attuale): niente prerendering.
  await connection();
  const supabase = await createClient();
  const claims = (await verifiedByProxy()) ?? (await supabase.auth.getClaims()).data?.claims;

  if (!claims?.sub) {
    redirect("/login");
  }

  return {
    supabase,
    user: {
      id: claims.sub,
      email: typeof claims.email === "string" ? claims.email : "",
    },
  };
}

/**
 * Utente già verificato dal proxy per questa richiesta. Il proxy cancella
 * l'header se arriva dall'esterno, quindi non si può falsificare; in ogni caso
 * i dati restano protetti dalle regole del database, che controllano il token.
 */
async function verifiedByProxy(): Promise<{ sub: string; email: string } | null> {
  const raw = (await headers()).get(USER_HEADER);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return typeof parsed?.sub === "string" ? parsed : null;
  } catch {
    return null;
  }
}
