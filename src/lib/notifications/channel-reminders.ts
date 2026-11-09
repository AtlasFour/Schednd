import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import type { GroupRow, ScheduleRow } from "@/lib/groups";
import { fetchOccurrences, meetingsBetween } from "@/lib/meetings";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { meetingSummaryLines, peopleByStatus } from "@/lib/share-text";
import { escapeTelegramHtml, getTelegramToken } from "@/lib/telegram";

type ChannelRow = {
  id: string;
  group_id: string;
  locale: string;
  groups:
    | (Pick<
        GroupRow,
        | "id"
        | "name"
        | "timezone"
        | "default_game_title"
        | "default_location"
        | "online_link"
        | "mode"
        | "min_attendees"
        | "status"
        | "kind"
      > & {
        group_schedules: ScheduleRow[];
        memberships: { user_id: string; profiles: { display_name: string } | null }[];
      })
    | null;
};

/**
 * Accoda nelle chat collegate il riepilogo degli incontri di domani e di
 * dopodomani (chi c'è, chi manca). Chiamata dal cron giornaliero.
 */
export async function queueChannelReminders(admin: SupabaseClient): Promise<number> {
  if (!getTelegramToken()) return 0;

  const { data, error } = await admin
    .from("group_channels")
    .select(
      "id, group_id, locale, groups(id, name, timezone, default_game_title, default_location, online_link, mode, min_attendees, status, kind, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(user_id, profiles(display_name)))",
    )
    .contains("events", ["reminders"]);
  if (error) {
    console.error("queueChannelReminders", error);
    return 0;
  }
  const channels = ((data ?? []) as unknown as ChannelRow[]).filter(
    (c) => c.groups && c.groups.status === "active",
  );
  if (channels.length === 0) return 0;

  const groupIds = [...new Set(channels.map((c) => c.group_id))];
  const occurrences = await fetchOccurrences(admin, groupIds, addDays(todayInTimeZone("Europe/Rome"), -2));

  // Nomi degli ospiti degli incontri interessati.
  const guestNames = new Map<string, string>();
  const guestIds = [...new Set(occurrences.flatMap((o) => (o.occurrence_guests ?? []).map((g) => g.user_id)))];
  if (guestIds.length) {
    const { data: profiles } = await admin.from("profiles").select("id, display_name").in("id", guestIds);
    for (const p of (profiles ?? []) as { id: string; display_name: string }[]) {
      guestNames.set(p.id, p.display_name);
    }
  }

  const rows: { channel_id: string; kind: string; title: string; body: string; url: string; event_key: string }[] = [];
  for (const channel of channels) {
    const g = channel.groups!;
    const locale = isLocale(channel.locale) ? channel.locale : "it";
    const m = MESSAGES[locale];
    const today = todayInTimeZone(g.timezone);
    const meetings = meetingsBetween(
      { ...g, memberCount: g.memberships.length },
      occurrences,
      "",
      addDays(today, 1),
      addDays(today, 2),
    );

    for (const meeting of meetings) {
      if (meeting.skipped) continue;
      const daysBefore = meeting.date === addDays(today, 1) ? 1 : 2;
      const occ = occurrences.find(
        (o) => o.group_id === g.id && o.original_date === meeting.originalDate,
      );
      const participants = [
        ...g.memberships.map((mm) => ({ user_id: mm.user_id, name: mm.profiles?.display_name ?? m.common.user })),
        ...(occ?.occurrence_guests ?? []).map((gu) => ({
          user_id: gu.user_id,
          name: `${guestNames.get(gu.user_id) ?? m.common.guest} ${m.calendar.guestTag}`,
        })),
      ];
      const lines = meetingSummaryLines(
        {
          groupName: g.name,
          date: meeting.date,
          startTime: meeting.startTime,
          skipped: false,
          game: meeting.game,
          location: g.mode === "online" ? null : meeting.location,
          onlineLink: g.mode === "in_person" ? null : g.online_link,
          notes: meeting.notes,
          minAttendees: meeting.minAttendees,
          openProposals: meeting.openProposals,
          people: peopleByStatus(participants, meeting.attendances, locale, m.common.formerParticipant),
        },
        m,
        locale,
        (t) => t,
      ).slice(1); // il nome del gruppo è già nel titolo

      rows.push({
        channel_id: channel.id,
        kind: "reminder",
        title: (daysBefore === 1 ? m.share.reminderTomorrow : m.share.reminderIn2) + g.name,
        body: lines.map(escapeTelegramHtml).join("\n"),
        url: `/groups/${g.id}/${meeting.originalDate}`,
        event_key: `reminder:${meeting.originalDate}:${meeting.date}:${daysBefore}`,
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
