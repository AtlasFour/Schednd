import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { signOut } from "../actions";
import { getSmtpConfig } from "@/lib/notifications/config";
import { NotificationSettings } from "./notification-settings";
import { ProfileForm } from "./profile-form";
import { CalendarSubscribe } from "./calendar-subscribe";
import { TelegramAccount } from "./telegram-account";
import { LanguagePicker } from "./language-picker";
import { ThemePicker } from "./theme-picker";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.profile.title };
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const { supabase, user } = await requireUser();
  const { locale, m } = await getI18n();
  const [{ data: profile }, { data: telegram }] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, timezone, bgg_username, notify_email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase.from("telegram_accounts").select("telegram_username, notify_private").eq("user_id", user.id).maybeSingle(),
  ]);

  return (
    <Page title={m.profile.title} subtitle={user.email} back={{ href: "/", label: m.common.home }}>
      <Card>
        <ProfileForm
          displayName={profile?.display_name ?? ""}
          timezone={profile?.timezone ?? "Europe/Rome"}
          bggUsername={profile?.bgg_username ?? null}
        />
      </Card>
      <Card title={m.profile.language}>
        <LanguagePicker current={locale} />
        <p className="mt-2 text-xs text-foreground/50">{m.profile.languageHint}</p>
      </Card>
      <Card title={m.profile.theme}>
        <ThemePicker />
        <p className="mt-2 text-xs text-foreground/50">{m.profile.thisDevice}</p>
      </Card>
      {process.env.TELEGRAM_BOT_TOKEN && (
        <Card title={`✈️ ${m.bot.profileTitle}`}>
          <TelegramAccount account={telegram ?? null} />
        </Card>
      )}
      <Card title={m.events.calendarTitle}>
        <CalendarSubscribe />
      </Card>
      <Card title={m.profile.notifications}>
        <NotificationSettings
          vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
          emailEnabled={profile?.notify_email ?? false}
          emailAvailable={getSmtpConfig() !== null}
        />
      </Card>
      <form action={signOut} className="self-start">
        <SubmitButton variant="secondary" small>
          {m.profile.signOut}
        </SubmitButton>
      </form>
      <a href="/profile/configurazione" className="self-start text-xs text-foreground/50 underline">
        {m.profile.serverConfig}
      </a>
    </Page>
  );
}
