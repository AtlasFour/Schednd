import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * Client Supabase da usare sul server (Server Components, Server Actions,
 * Route Handlers). Va creato di nuovo per ogni richiesta.
 */
export async function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("Variabili d'ambiente di Supabase mancanti.");
  }

  const cookieStore = await cookies();

  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Chiamato da un Server Component, dove i cookie non si possono
          // scrivere: ci pensa il proxy a rinnovare la sessione.
        }
      },
    },
  });
}
