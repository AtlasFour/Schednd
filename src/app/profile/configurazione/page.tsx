import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { notificationSetupStatus } from "@/lib/notifications/config";
import { KeyGenerator } from "./key-generator";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.config.title };
}

export default function ConfigPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Config />
    </Suspense>
  );
}

async function Config() {
  await requireUser();
  const { m } = await getI18n();
  const status = notificationSetupStatus();
  const ready = status.serviceRole && status.vapidPublic && status.vapidPrivate && status.cronSecret;

  const rows: { label: string; env: string; ok: boolean; optional?: boolean }[] = [
    { label: m.config.rowServiceRole, env: "SUPABASE_SERVICE_ROLE_KEY", ok: status.serviceRole },
    { label: m.config.rowVapidPublic, env: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", ok: status.vapidPublic },
    { label: m.config.rowVapidPrivate, env: "VAPID_PRIVATE_KEY", ok: status.vapidPrivate },
    { label: m.config.rowCron, env: "CRON_SECRET", ok: status.cronSecret },
    { label: m.config.rowSmtp, env: "SMTP_HOST, SMTP_USER, SMTP_PASSWORD", ok: status.smtp, optional: true },
    { label: m.config.rowBgg, env: "BGG_API_TOKEN", ok: status.bgg, optional: true },
    { label: m.config.rowTelegram, env: "TELEGRAM_BOT_TOKEN", ok: status.telegram, optional: true },
  ];

  return (
    <Page
      title={m.config.title}
      subtitle={m.config.subtitle}
      back={{ href: "/profile", label: m.common.profile }}
    >
      <Card title={ready ? m.config.ready : m.config.status}>
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

      <Card title={m.config.step1}>
        <p className="mb-3 text-sm text-foreground/70">{m.config.step1Text}</p>
        <KeyGenerator />
      </Card>

      <Card title={m.config.step2}>
        <Steps items={m.config.step2Items} />
      </Card>

      <Card title={m.config.telegramTitle}>
        <Steps items={m.config.telegramItems} />
      </Card>

      <Card title={m.config.bggTitle}>
        <Steps items={m.config.bggItems} />
        <a
          href="https://boardgamegeek.com/applications"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-sm text-brand underline"
        >
          boardgamegeek.com/applications ↗
        </a>
      </Card>

      <Card title={m.config.step3}>
        <p className="text-sm text-foreground/70">{m.config.step3Text}</p>
      </Card>
    </Page>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-foreground/80">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}
