import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { getTelegramToken } from "@/lib/telegram";
import {
  attendanceKeyboard,
  BOT_GROUP_SELECT,
  groupMeetings,
  loadBotMeetings,
  meetingSummaryHtml,
  type BotGroup,
} from "@/lib/telegram-bot";

type ChannelRow = { id: string; group_id: string; locale: string; groups: BotGroup | null };

/**
 * Accoda nelle chat collegate il riepilogo degli incontri di domani e di
 * dopodomani (chi c'è, chi manca), con i pulsanti per rispondere.
 * Chiamata dal cron giornaliero.
 */
export async function queueChannelReminders(admin: SupabaseClient): Promise<number> {
  if (!getTelegramToken()) return 0;

  const { data, error } = await admin
    .from("group_channels")
    .select(`id, group_id, locale, groups(${BOT_GROUP_SELECT})`)
    .contains("events", ["reminders"]);
  if (error) {
    console.error("queueChannelReminders", error);
    return 0;
  }
  const channels = ((data ?? []) as unknown as ChannelRow[]).filter(
    (c) => c.groups && c.groups.status === "active",
  );
  if (channels.length === 0) return 0;

  const meetingsData = await loadBotMeetings(
    admin,
    [...new Set(channels.map((c) => c.group_id))],
    todayInTimeZone("Europe/Rome"),
  );

  const rows: {
    channel_id: string;
    kind: string;
    title: string;
    body: string;
    url: string;
    event_key: string;
    reply_markup: unknown;
  }[] = [];
  for (const channel of channels) {
    const g = channel.groups!;
    const locale = isLocale(channel.locale) ? channel.locale : "it";
    const m = MESSAGES[locale];
    const today = todayInTimeZone(g.timezone);

    for (const meeting of groupMeetings(g, meetingsData, addDays(today, 1), addDays(today, 2))) {
      if (meeting.skipped) continue;
      const daysBefore = meeting.date === addDays(today, 1) ? 1 : 2;
      rows.push({
        channel_id: channel.id,
        kind: "reminder",
        title: (daysBefore === 1 ? m.share.reminderTomorrow : m.share.reminderIn2) + g.name,
        body: meetingSummaryHtml(g, meeting, meetingsData, m, locale),
        url: `/groups/${g.id}/${meeting.originalDate}`,
        event_key: `reminder:${meeting.originalDate}:${meeting.date}:${daysBefore}`,
        reply_markup: attendanceKeyboard(g.id, meeting.originalDate, m),
      });
    }
  }

  if (rows.length === 0) return 0;
  const { error: insertError } = await admin
    .from("channel_outbox")
    .upsert(rows, { onConflict: "channel_id,event_key", ignoreDuplicates: true });
  if (insertError) console.error("channel reminders", insertError);
  return rows.length;
}
