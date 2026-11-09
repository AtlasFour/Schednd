/**
 * Legge le variabili d'ambiente di Supabase.
 * Vanno impostate su Vercel (Settings → Environment Variables)
 * e, per lo sviluppo locale, in un file `.env.local` (escluso da git).
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  return { url, anonKey };
}
