import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Restituisce l'utente collegato e un client Supabase.
 * Se l'utente non ha fatto login, lo manda alla pagina di accesso.
 */
export async function requireUser() {
  // Dati legati alla richiesta (sessione, ora attuale): niente prerendering.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

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
