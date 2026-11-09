import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

/** Client Supabase da usare nei componenti che girano nel browser. */
export function createClient() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("Variabili d'ambiente di Supabase mancanti.");
  }
  return createBrowserClient(env.url, env.anonKey);
}
