/** Configurazione delle notifiche, letta dalle variabili d'ambiente. */

export function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const subject =
    process.env.VAPID_SUBJECT ??
    (productionHost ? `https://${productionHost}` : "mailto:notifiche@schednd.invalid");
  return { publicKey, privateKey, subject };
}

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    from: process.env.SMTP_FROM ?? `Schednd <${user}>`,
  };
}

/** Indirizzo pubblico del sito, per i link nelle email. */
export function getPublicSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}` : "http://localhost:3000";
}

/** Stato della configurazione (solo booleani: nessun segreto). */
export function notificationSetupStatus() {
  return {
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vapidPublic: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivate: Boolean(process.env.VAPID_PRIVATE_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
    smtp: getSmtpConfig() !== null,
  };
}
