/**
 * Cookie firmato che ricorda per qualche minuto che l'utente è approvato,
 * così il proxy non deve chiederlo al database a ogni pagina.
 * Formato: "<userId>.<scadenza in secondi>.<firma HMAC>".
 */
export const ACCESS_COOKIE = "schednd_access";
export const ACCESS_COOKIE_TTL = 10 * 60;

function secret() {
  return process.env.ACCESS_COOKIE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || null;
}

async function sign(payload: string, key: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Valore del cookie per questo utente, o null se manca il segreto. */
export async function makeAccessCookie(userId: string, now = Date.now()) {
  const key = secret();
  if (!key) return null;
  const payload = `${userId}.${Math.floor(now / 1000) + ACCESS_COOKIE_TTL}`;
  return `${payload}.${await sign(payload, key)}`;
}

/** True se il cookie è valido, non scaduto e di questo utente. */
export async function checkAccessCookie(value: string | undefined, userId: string, now = Date.now()) {
  const key = secret();
  if (!key || !value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [id, exp, sig] = parts;
  if (id !== userId || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const expected = await sign(`${id}.${exp}`, key);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}
