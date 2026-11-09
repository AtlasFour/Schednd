import { createTransport } from "nodemailer";
import { sendNotification, type PushSubscription } from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicSiteUrl, getSmtpConfig, getVapidConfig } from "./config";

type QueueRow = {
  id: number;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  attempts: number;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

type ProfileRow = { id: string; notify_push: boolean; notify_email: boolean };

export type ProcessResult = { claimed: number; push: number; email: number; failed: number };

/**
 * Invia le notifiche in coda (push e/o email secondo le preferenze).
 * Non fa nulla se le variabili d'ambiente necessarie non sono impostate.
 */
export async function processNotificationQueue(limit = 200): Promise<ProcessResult> {
  const result: ProcessResult = { claimed: 0, push: 0, email: 0, failed: 0 };
  const admin = createAdminClient();
  if (!admin) return result;

  const vapid = getVapidConfig();
  const smtp = getSmtpConfig();

  const { data, error } = await admin.rpc("claim_notifications", { p_limit: limit });
  if (error) {
    console.error("claim_notifications", error);
    return result;
  }
  const rows = (data ?? []) as QueueRow[];
  result.claimed = rows.length;
  if (rows.length === 0) return result;

  const userIds = [...new Set(rows.map((r) => r.user_id))];
  const [{ data: subs }, { data: profiles }] = await Promise.all([
    admin
      .from("push_subscriptions")
      .select("id, user_id, endpoint, p256dh, auth")
      .in("user_id", userIds),
    admin.from("profiles").select("id, notify_push, notify_email").in("id", userIds),
  ]);

  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const s of (subs ?? []) as SubscriptionRow[]) {
    subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  }
  const prefs = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  // Email degli utenti che le vogliono (solo se l'SMTP è configurato).
  const emails = new Map<string, string>();
  if (smtp) {
    for (const id of userIds.filter((id) => prefs.get(id)?.notify_email)) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (u.user?.email) emails.set(id, u.user.email);
    }
  }
  const mailer = smtp
    ? createTransport({ host: smtp.host, port: smtp.port, secure: smtp.secure, auth: smtp.auth })
    : null;

  const deadSubscriptions = new Set<string>();
  const sentIds: number[] = [];
  const failedIds: number[] = [];

  for (const row of rows) {
    const pref = prefs.get(row.user_id);
    let delivered = false;
    let hadError = false;

    if (vapid && pref?.notify_push !== false) {
      for (const sub of subsByUser.get(row.user_id) ?? []) {
        if (deadSubscriptions.has(sub.id)) continue;
        const subscription: PushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          await sendNotification(
            subscription,
            JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: row.kind }),
            {
              vapidDetails: {
                subject: vapid.subject,
                publicKey: vapid.publicKey,
                privateKey: vapid.privateKey,
              },
              TTL: 60 * 60 * 24,
            },
          );
          delivered = true;
          result.push += 1;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            // Iscrizione scaduta (app disinstallata, permesso revocato...).
            deadSubscriptions.add(sub.id);
          } else {
            hadError = true;
            console.error("push", status, (err as Error).message);
          }
        }
      }
    }

    const email = emails.get(row.user_id);
    if (mailer && smtp && email) {
      const link = new URL(row.url, getPublicSiteUrl()).toString();
      try {
        await mailer.sendMail({
          from: smtp.from,
          to: email,
          subject: row.title,
          text: `${row.body}\n\nApri Schednd: ${link}`,
          html: `<p>${escapeHtml(row.body)}</p><p><a href="${escapeHtml(link)}">Apri Schednd</a></p>`,
        });
        delivered = true;
        result.email += 1;
      } catch (err) {
        hadError = true;
        console.error("email", (err as Error).message);
      }
    }

    // Senza canali attivi la notifica si considera chiusa: non va ritentata.
    if (delivered || !hadError) sentIds.push(row.id);
    else failedIds.push(row.id);
  }

  result.failed = failedIds.length;

  await Promise.all([
    sentIds.length
      ? admin.from("notification_queue").update({ sent_at: new Date().toISOString() }).in("id", sentIds)
      : null,
    failedIds.length
      ? admin.from("notification_queue").update({ claimed_at: null }).in("id", failedIds)
      : null,
    deadSubscriptions.size
      ? admin.from("push_subscriptions").delete().in("id", [...deadSubscriptions])
      : null,
  ]);

  return result;
}

function escapeHtml(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
