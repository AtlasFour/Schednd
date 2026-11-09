import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { notificationSetupStatus } from "@/lib/notifications/config";
import { KeyGenerator } from "./key-generator";

export const metadata: Metadata = { title: "Configurazione" };

export default function ConfigPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Config />
    </Suspense>
  );
}

async function Config() {
  await requireUser();
  const status = notificationSetupStatus();
  const ready = status.serviceRole && status.vapidPublic && status.vapidPrivate && status.cronSecret;

  const rows: { label: string; env: string; ok: boolean; optional?: boolean }[] = [
    { label: "Chiave service_role di Supabase", env: "SUPABASE_SERVICE_ROLE_KEY", ok: status.serviceRole },
    { label: "Chiave pubblica notifiche", env: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", ok: status.vapidPublic },
    { label: "Chiave privata notifiche", env: "VAPID_PRIVATE_KEY", ok: status.vapidPrivate },
    { label: "Segreto del cron giornaliero", env: "CRON_SECRET", ok: status.cronSecret },
    { label: "Invio email (facoltativo)", env: "SMTP_HOST, SMTP_USER, SMTP_PASSWORD", ok: status.smtp, optional: true },
    { label: "Import da BoardGameGeek (facoltativo)", env: "BGG_API_TOKEN", ok: status.bgg, optional: true },
  ];

  return (
    <Page
      title="Configurazione"
      subtitle="Notifiche push, email e promemoria automatici"
      back={{ href: "/profile", label: "Profilo" }}
    >
      <Card title={ready ? "✅ Notifiche pronte" : "Stato"}>
        <ul className="flex flex-col gap-2 text-sm">
          {rows.map((r) => (
            <li key={r.env} className="flex items-start gap-2">
              <span aria-hidden>{r.ok ? "✅" : r.optional ? "➖" : "❌"}</span>
              <span>
                {r.label}
                <span className="block font-mono text-xs text-foreground/50">{r.env}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="1. Genera le chiavi">
        <p className="mb-3 text-sm text-foreground/70">
          Le chiavi vengono create nel tuo browser e non vengono salvate da nessuna parte.
        </p>
        <KeyGenerator />
      </Card>

      <Card title="2. Inseriscile su Vercel">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground/80">
          <li>
            Vercel → progetto <strong>schednd</strong> → <strong>Settings → Environment Variables</strong>.
          </li>
          <li>Aggiungi le tre chiavi generate qui sopra, con quei nomi esatti.</li>
          <li>
            Aggiungi <span className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</span>: la trovi
            in Supabase → <strong>Project Settings → API</strong> (chiave <em>service_role</em> o{" "}
            <em>secret</em>). È segreta: non va mai condivisa.
          </li>
          <li>
            Facoltativo, per le email: <span className="font-mono text-xs">SMTP_HOST</span>{" "}
            (smtp.gmail.com), <span className="font-mono text-xs">SMTP_PORT</span> (465),{" "}
            <span className="font-mono text-xs">SMTP_USER</span> (l&apos;indirizzo Gmail),{" "}
            <span className="font-mono text-xs">SMTP_PASSWORD</span> (la password per le app).
          </li>
          <li>
            <strong>Deployments → ⋯ → Redeploy</strong> sull&apos;ultima versione, perché le
            variabili valgono solo dopo una nuova pubblicazione.
          </li>
        </ol>
      </Card>

      <Card title="BoardGameGeek (facoltativo)">
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground/80">
          <li>
            Su BoardGameGeek, da loggato, apri{" "}
            <a href="https://boardgamegeek.com/applications" target="_blank" rel="noreferrer" className="text-brand underline">
              boardgamegeek.com/applications
            </a>{" "}
            e registra un&apos;applicazione (uso non commerciale, nome &quot;Schednd&quot;).
          </li>
          <li>Crea un token per l&apos;applicazione e copialo.</li>
          <li>
            Su Vercel aggiungi la variabile <span className="font-mono text-xs">BGG_API_TOKEN</span>{" "}
            con il token, poi fai <strong>Redeploy</strong>.
          </li>
        </ol>
      </Card>

      <Card title="3. Attiva le notifiche">
        <p className="text-sm text-foreground/70">
          Dal <a href="/profile" className="text-brand underline">profilo</a>, su ogni telefono:
          &quot;Attiva le notifiche&quot; e poi &quot;Invia una prova&quot;. I promemoria
          automatici partono ogni mattina verso le 9.
        </p>
      </Card>
    </Page>
  );
}
