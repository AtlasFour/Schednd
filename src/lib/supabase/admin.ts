import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./env";

/**
 * Client Supabase con la chiave service_role: ignora le regole di accesso.
 * Da usare SOLO sul server, per lavori di sistema (notifiche, cron).
 * La chiave va in SUPABASE_SERVICE_ROLE_KEY e non deve mai arrivare al browser.
 */
export function createAdminClient() {
  const env = getSupabaseEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) return null;
  return createClient(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
