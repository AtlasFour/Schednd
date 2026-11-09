import { NextResponse, type NextRequest } from "next/server";
import { processNotificationQueue } from "@/lib/notifications/process";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Chiamata una volta al giorno dal cron di Vercel (vedi vercel.json).
 * Chiude le proposte scadute, accoda i promemoria (2 giorni e 1 giorno prima)
 * e invia le notifiche in coda.
 *
 * Vercel aggiunge da solo l'intestazione "Authorization: Bearer <CRON_SECRET>"
 * se la variabile CRON_SECRET è impostata nel progetto.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY non configurata" },
      { status: 500 },
    );
  }

  const { data: enqueued, error } = await admin.rpc("run_daily_notifications");
  if (error) {
    console.error("run_daily_notifications", error);
    return NextResponse.json({ error: "Errore nel calcolo dei promemoria" }, { status: 500 });
  }

  // Più giri, nel caso la coda superi il blocco di 200.
  let total = { claimed: 0, push: 0, email: 0, failed: 0 };
  for (let i = 0; i < 5; i++) {
    const r = await processNotificationQueue();
    total = {
      claimed: total.claimed + r.claimed,
      push: total.push + r.push,
      email: total.email + r.email,
      failed: total.failed + r.failed,
    };
    if (r.claimed < 200) break;
  }

  return NextResponse.json({ enqueued, ...total });
}
