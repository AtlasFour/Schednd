import type { SupabaseClient } from "@supabase/supabase-js";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { GroupRow, ScheduleRow } from "@/lib/groups";
import {
  fetchOccurrences,
  meetingsBetween,
  type Meeting,
  type OccurrenceRow,
} from "@/lib/meetings";
import { getPublicSiteUrl } from "@/lib/notifications/config";
import { formatDeadline, optionLabel, PROPOSAL_SELECT, type ProposalRow } from "@/lib/proposals";
import { addDays, capitalize, formatLongDate, formatTime, todayInTimeZone } from "@/lib/schedule";
import { meetingSummaryLines, peopleByStatus } from "@/lib/share-text";
import { escapeTelegramHtml as esc, type InlineKeyboard } from "@/lib/telegram";

/** Gruppo con i dati che servono al bot (letto con il client di servizio). */
export type BotGroup = Pick<
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
};

export const BOT_GROUP_SELECT =
  "id, name, timezone, default_game_title, default_location, online_link, mode, min_attendees, status, kind, group_schedules(id, anchor_date, interval_weeks, start_time, valid_until), memberships(user_id, profiles(display_name))";

export async function loadBotGroup(admin: SupabaseClient, groupId: string): Promise<BotGroup | null> {
  const { data } = await admin.from("groups").select(BOT_GROUP_SELECT).eq("id", groupId).maybeSingle();
  return (data as unknown as BotGroup | null) ?? null;
}

/** Incontri e dati collegati (ospiti) di alcuni gruppi, tra due date. */
export type BotMeetings = {
  occurrences: OccurrenceRow[];
  guestNames: Map<string, string>;
};

export async function loadBotMeetings(
  admin: SupabaseClient,
  groupIds: string[],
  fromDate: string,
): Promise<BotMeetings> {
  const occurrences = await fetchOccurrences(admin, groupIds, addDays(fromDate, -62));
  const guestNames = new Map<string, string>();
  const guestIds = [...new Set(occurrences.flatMap((o) => (o.occurrence_guests ?? []).map((g) => g.user_id)))];
  if (guestIds.length) {
    const { data } = await admin.from("profiles").select("id, display_name").in("id", guestIds);
    for (const p of (data ?? []) as { id: string; display_name: string }[]) guestNames.set(p.id, p.display_name);
  }
  return { occurrences, guestNames };
}

export function groupMeetings(group: BotGroup, data: BotMeetings, from: string, to: string): Meeting[] {
  return meetingsBetween({ ...group, memberCount: group.memberships.length }, data.occurrences, "", from, to);
}

/** Prossimi incontri (non saltati) entro ~3 mesi. */
export function nextMeetings(group: BotGroup, data: BotMeetings, count: number): Meeting[] {
  const today = todayInTimeZone(group.timezone);
  return groupMeetings(group, data, today, addDays(today, 92))
    .filter((m) => !m.skipped)
    .slice(0, count);
}

export function meetingUrl(groupId: string, originalDate: string) {
  return `${getPublicSiteUrl()}/groups/${groupId}/${originalDate}`;
}

/** Riepilogo di un incontro in HTML per Telegram (senza il titolo). */
export function meetingSummaryHtml(
  group: BotGroup,
  meeting: Meeting,
  data: BotMeetings,
  m: Messages,
  locale: Locale,
  peopleOnly = false,
): string {
  const occ = data.occurrences.find((o) => o.group_id === group.id && o.original_date === meeting.originalDate);
  const participants = [
    ...group.memberships.map((mm) => ({ user_id: mm.user_id, name: mm.profiles?.display_name ?? m.common.user })),
    ...(occ?.occurrence_guests ?? []).map((g) => ({
      user_id: g.user_id,
      name: `${data.guestNames.get(g.user_id) ?? m.common.guest} ${m.calendar.guestTag}`,
    })),
  ];
  const summary = meetingSummaryLines(
    {
      groupName: group.name,
      date: meeting.date,
      startTime: meeting.startTime,
      skipped: meeting.skipped,
      game: meeting.game,
      location: group.mode === "online" ? null : meeting.location,
      onlineLink: group.mode === "in_person" ? null : group.online_link,
      notes: meeting.notes,
      minAttendees: meeting.minAttendees,
      openProposals: meeting.openProposals,
      people: peopleByStatus(participants, meeting.attendances, locale, m.common.formerParticipant),
    },
    m,
    locale,
    (t) => t,
  ).slice(1); // il nome del gruppo va nel titolo
  // Solo data e persone (comando /chi): si salta la parte con gioco, luogo e note.
  const lines = peopleOnly ? [summary[0], ...summary.slice(summary.indexOf("") + 1)] : summary;
  return lines.map(esc).join("\n");
}

/** Pulsanti per rispondere a un incontro. callback_data: "a|<gruppo>|<AAAAMMGG>|<y/m/n>". */
export function attendanceKeyboard(groupId: string, originalDate: string, m: Messages): InlineKeyboard {
  const d = originalDate.replaceAll("-", "");
  return {
    inline_keyboard: [
      [
        { text: m.bot.btnYes, callback_data: `a|${groupId}|${d}|y` },
        { text: m.bot.btnMaybe, callback_data: `a|${groupId}|${d}|m` },
        { text: m.bot.btnNo, callback_data: `a|${groupId}|${d}|n` },
      ],
      [{ text: m.bot.btnOpen, url: meetingUrl(groupId, originalDate) }],
    ],
  };
}

export function meetingMessage(
  title: string,
  group: BotGroup,
  meeting: Meeting,
  data: BotMeetings,
  m: Messages,
  locale: Locale,
  peopleOnly = false,
) {
  return {
    html: `<b>${esc(title + group.name)}</b>\n${meetingSummaryHtml(group, meeting, data, m, locale, peopleOnly)}`,
    keyboard: meeting.skipped ? null : attendanceKeyboard(group.id, meeting.originalDate, m),
  };
}

/** Riga breve per un elenco di incontri. */
export function meetingLine(meeting: Meeting, m: Messages, locale: Locale) {
  const when = `${capitalize(formatLongDate(meeting.date, locale))} · ${formatTime(meeting.startTime)}`;
  const game = meeting.game ? ` · 🎮 ${meeting.game}` : "";
  const yes = meeting.counts.yes;
  const min = meeting.minAttendees ? `/${meeting.minAttendees}` : "";
  return esc(`📅 ${when}${game} · ✅ ${yes}${min}`);
}

// -----------------------------------------------------------------------------
// Proposte
// -----------------------------------------------------------------------------

export type BotProposal = ProposalRow & {
  occurrences: { group_id: string; original_date: string; start_date: string } | null;
};

export async function openProposals(admin: SupabaseClient, groupId: string): Promise<BotProposal[]> {
  const { data, error } = await admin
    .from("proposals")
    .select(`${PROPOSAL_SELECT}, occurrences!inner(group_id, original_date, start_date)`)
    .eq("occurrences.group_id", groupId)
    .in("status", ["open", "needs_owner"])
    .order("created_at");
  if (error) console.error("openProposals", error);
  const rows = (data ?? []) as unknown as BotProposal[];
  for (const p of rows) p.proposal_options.sort((a, b) => a.position - b.position);
  return rows;
}

export async function loadProposal(admin: SupabaseClient, proposalId: string): Promise<BotProposal | null> {
  const { data } = await admin
    .from("proposals")
    .select(`${PROPOSAL_SELECT}, occurrences!inner(group_id, original_date, start_date)`)
    .eq("id", proposalId)
    .maybeSingle();
  const p = (data as unknown as BotProposal | null) ?? null;
  p?.proposal_options.sort((a, b) => a.position - b.position);
  return p;
}

/** Messaggio di una proposta con un pulsante per opzione (e il numero di voti). */
export function proposalMessage(
  p: BotProposal,
  group: Pick<BotGroup, "id" | "name" | "timezone">,
  m: Messages,
  locale: Locale,
) {
  const votes = new Map<string, number>();
  for (const b of p.ballots) for (const id of b.option_ids) votes.set(id, (votes.get(id) ?? 0) + 1);
  const type = m.labels.proposalType[p.type];
  const date = p.occurrences ? capitalize(formatLongDate(p.occurrences.start_date, locale)) : "";
  const lines = [
    `<b>${esc(`${type.emoji} ${group.name}`)}</b>`,
    esc(m.bot.proposalHeader(type.label, date)),
  ];
  if (p.reason) lines.push(`<i>${esc(`“${p.reason}”`)}</i>`);
  lines.push("", esc(m.bot.proposalCloses(formatDeadline(p.closes_at, group.timezone, locale))));

  const keyboard: InlineKeyboard = {
    inline_keyboard: [
      ...p.proposal_options.map((o) => [
        {
          text: `${optionLabel(p.type, o, m, locale)} · ${votes.get(o.id) ?? 0} 🗳️`,
          callback_data: `v|${p.id}|${o.position}`,
        },
      ]),
      [{ text: m.bot.noneOption, callback_data: `v|${p.id}|x` }],
      ...(p.occurrences
        ? [[{ text: m.bot.btnOpen, url: `${meetingUrl(group.id, p.occurrences.original_date)}#proposte` }]]
        : []),
    ],
  };
  return { html: lines.join("\n"), keyboard };
}
