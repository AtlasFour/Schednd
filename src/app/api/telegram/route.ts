import { timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale, type Locale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  answerTelegramCallback,
  editTelegramMessage,
  escapeTelegramHtml as esc,
  sendTelegramMessage,
  telegramWebhookSecret,
} from "@/lib/telegram";
import {
  BOT_GROUP_SELECT,
  groupMeetings,
  loadBotGroup,
  loadBotMeetings,
  loadProposal,
  meetingLine,
  meetingMessage,
  meetingSummaryHtml,
  nextMeetings,
  openProposals,
  proposalMessage,
  type BotGroup,
  type BotMeetings,
} from "@/lib/telegram-bot";
import { addDays, todayInTimeZone } from "@/lib/schedule";

type Chat = { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
type From = { id: number; username?: string; first_name?: string; language_code?: string };
type Update = {
  message?: { chat: Chat; text?: string; migrate_to_chat_id?: number; from?: From };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
  callback_query?: {
    id: string;
    from: From;
    data?: string;
    message?: { message_id: number; chat: Chat; text?: string };
  };
};

const ok = () => NextResponse.json({ ok: true });

/**
 * Webhook del bot Telegram: Telegram chiama questo indirizzo per ogni
 * messaggio rivolto al bot e per ogni tocco sui suoi pulsanti.
 */
export async function POST(request: NextRequest) {
  const secret = telegramWebhookSecret();
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return ok();

  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return ok();

  try {
    if (update.callback_query) await handleCallback(admin, update.callback_query);
    else if (update.my_chat_member) await handleMembership(admin, update.my_chat_member);
    else if (update.message) await handleMessage(admin, update.message);
  } catch (err) {
    console.error("telegram webhook", err);
  }
  // Sempre 200: altrimenti Telegram ripete la stessa chiamata.
  return ok();
}

function langOf(from?: From): Locale {
  return from?.language_code && !from.language_code.startsWith("it") ? "en" : "it";
}

const isGroupChat = (chat: Chat) => chat.type === "group" || chat.type === "supergroup";

/** Gruppo di Schednd collegato a una chat Telegram (con la lingua scelta). */
async function channelFor(admin: SupabaseClient, chatId: string) {
  const { data } = await admin
    .from("group_channels")
    .select(`group_id, locale, groups(${BOT_GROUP_SELECT})`)
    .eq("provider", "telegram")
    .eq("chat_id", chatId)
    .limit(1)
    .maybeSingle();
  const row = data as unknown as { group_id: string; locale: string; groups: BotGroup | null } | null;
  if (!row?.groups) return null;
  return { group: row.groups, locale: (isLocale(row.locale) ? row.locale : "it") as Locale };
}

async function handleMembership(
  admin: SupabaseClient,
  member: NonNullable<Update["my_chat_member"]>,
) {
  if (!["left", "kicked"].includes(member.new_chat_member.status)) return;
  const chatId = String(member.chat.id);
  if (member.chat.type === "private") {
    // L'utente ha bloccato il bot: niente più avvisi privati.
    await admin.from("telegram_accounts").update({ private_chat_id: null }).eq("private_chat_id", chatId);
  } else {
    await admin.from("group_channels").delete().eq("provider", "telegram").eq("chat_id", chatId);
  }
}

const COMMAND = /^\/([a-z_]+)(?:@\w+)?(?:\s+([^]+))?$/i;

async function handleMessage(admin: SupabaseClient, message: NonNullable<Update["message"]>) {
  const chatId = String(message.chat.id);

  // Il gruppo è diventato "supergruppo" e ha cambiato id.
  if (message.migrate_to_chat_id) {
    await admin
      .from("group_channels")
      .update({ chat_id: String(message.migrate_to_chat_id) })
      .eq("provider", "telegram")
      .eq("chat_id", chatId);
    return;
  }

  const match = COMMAND.exec(message.text?.trim() ?? "");
  if (!match) return;
  const command = match[1].toLowerCase();
  const arg = match[2]?.trim() ?? "";
  const code = /^[a-f0-9]{16}$/i.test(arg) ? arg.toLowerCase() : null;
  const lang = langOf(message.from);

  if (!isGroupChat(message.chat)) {
    await handlePrivate(admin, message, command, code, lang);
    return;
  }

  // Collegamento della chat a un gruppo di Schednd.
  if (code && ["start", "collega", "link"].includes(command)) {
    const { data: groupName, error } = await admin.rpc("link_channel", {
      p_code: code,
      p_provider: "telegram",
      p_chat_id: chatId,
      p_chat_title: message.chat.title ?? "Telegram",
    });
    if (error) console.error("link_channel", error);
    const linked = typeof groupName === "string" ? await channelFor(admin, chatId) : null;
    const m = MESSAGES[linked?.locale ?? lang];
    await sendTelegramMessage(
      chatId,
      esc(typeof groupName === "string" ? m.channels.botLinked(groupName) : m.channels.botInvalid),
    );
    return;
  }

  const channel = await channelFor(admin, chatId);
  if (!channel) {
    if (["start", "help", "aiuto", "prossimo", "next", "chi", "who", "calendario", "calendar", "proposte", "proposals"].includes(command)) {
      await sendTelegramMessage(chatId, esc(MESSAGES[lang].bot.notLinkedChat));
    }
    return;
  }
  const { group, locale } = channel;
  const m = MESSAGES[locale];

  switch (command) {
    case "prossimo":
    case "next":
    case "chi":
    case "who": {
      const data = await loadBotMeetings(admin, [group.id], todayInTimeZone(group.timezone));
      const [next] = nextMeetings(group, data, 1);
      if (!next) {
        await sendTelegramMessage(chatId, esc(m.bot.noMeetings));
        return;
      }
      const who = command === "chi" || command === "who";
      const msg = meetingMessage(who ? m.bot.whoTitle : m.bot.nextTitle, group, next, data, m, locale, who);
      await sendTelegramMessage(chatId, msg.html, msg.keyboard);
      return;
    }
    case "calendario":
    case "calendar": {
      const data = await loadBotMeetings(admin, [group.id], todayInTimeZone(group.timezone));
      const list = nextMeetings(group, data, 4);
      const body = list.length ? list.map((x) => meetingLine(x, m, locale)).join("\n") : esc(m.bot.noMeetings);
      await sendTelegramMessage(chatId, `<b>${esc(m.bot.calendarTitle + group.name)}</b>\n${body}`);
      return;
    }
    case "proposte":
    case "proposals": {
      const list = await openProposals(admin, group.id);
      if (list.length === 0) {
        await sendTelegramMessage(chatId, esc(m.bot.noProposals));
        return;
      }
      for (const p of list.slice(0, 5)) {
        const msg = proposalMessage(p, group, m, locale);
        await sendTelegramMessage(chatId, msg.html, msg.keyboard);
      }
      return;
    }
    case "start":
    case "help":
    case "aiuto":
      await sendTelegramMessage(chatId, esc(m.channels.botHelp));
      return;
  }
}

/** Chat privata con il bot: collegamento dell'account e prossimi incontri. */
async function handlePrivate(
  admin: SupabaseClient,
  message: NonNullable<Update["message"]>,
  command: string,
  code: string | null,
  lang: Locale,
) {
  const chatId = String(message.chat.id);
  const from = message.from;

  if (code && from && ["start", "collega", "link"].includes(command)) {
    const { data: name, error } = await admin.rpc("link_telegram_account", {
      p_code: code,
      p_telegram_user_id: String(from.id),
      p_username: from.username ?? from.first_name ?? "",
      p_private_chat_id: chatId,
    });
    if (error) console.error("link_telegram_account", error);
    const locale = typeof name === "string" ? await userLocale(admin, String(from.id), lang) : lang;
    const m = MESSAGES[locale];
    await sendTelegramMessage(
      chatId,
      esc(typeof name === "string" ? m.bot.accountLinked(name || from.first_name || "") : m.bot.accountInvalid),
    );
    return;
  }

  if (["prossimo", "next"].includes(command) && from) {
    const { data: account } = await admin
      .from("telegram_accounts")
      .select("user_id")
      .eq("telegram_user_id", String(from.id))
      .maybeSingle();
    const locale = await userLocale(admin, String(from.id), lang);
    const m = MESSAGES[locale];
    if (!account) {
      await sendTelegramMessage(chatId, esc(m.bot.needAccount));
      return;
    }
    const { data: memberships } = await admin
      .from("memberships")
      .select(`groups(${BOT_GROUP_SELECT})`)
      .eq("user_id", account.user_id);
    const groups = ((memberships ?? []) as unknown as { groups: BotGroup | null }[])
      .map((r) => r.groups)
      .filter((g): g is BotGroup => g !== null && g.status === "active");
    const data = await loadBotMeetings(admin, groups.map((g) => g.id), todayInTimeZone("Europe/Rome"));
    const upcoming = groups
      .flatMap((g) => nextMeetings(g, data, 3).map((x) => ({ g, x })))
      .sort((a, b) => (a.x.date + a.x.startTime).localeCompare(b.x.date + b.x.startTime))
      .slice(0, 6);
    const body = upcoming.length
      ? upcoming.map(({ g, x }) => `<b>${esc(g.name)}</b>\n${meetingLine(x, m, locale)}`).join("\n\n")
      : esc(m.bot.noMeetings);
    await sendTelegramMessage(chatId, `<b>${esc(m.bot.myNextTitle)}</b>\n\n${body}`);
    return;
  }

  if (["start", "help", "aiuto"].includes(command)) {
    await sendTelegramMessage(chatId, esc(MESSAGES[lang].bot.privateHelp));
  }
}

/** Lingua dell'utente Schednd collegato a un account Telegram. */
async function userLocale(admin: SupabaseClient, telegramUserId: string, fallback: Locale): Promise<Locale> {
  const { data } = await admin
    .from("telegram_accounts")
    .select("profiles(locale)")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  const locale = (data as unknown as { profiles: { locale: string | null } | null } | null)?.profiles?.locale;
  return isLocale(locale) ? locale : fallback;
}

const STATUS: Record<string, "yes" | "maybe" | "no"> = { y: "yes", m: "maybe", n: "no" };

async function handleCallback(admin: SupabaseClient, cb: NonNullable<Update["callback_query"]>) {
  const parts = (cb.data ?? "").split("|");
  const chat = cb.message?.chat;
  const chatId = chat ? String(chat.id) : null;
  const channel = chatId && chat && isGroupChat(chat) ? await channelFor(admin, chatId) : null;
  const locale = channel?.locale ?? (await userLocale(admin, String(cb.from.id), langOf(cb.from)));
  const m = MESSAGES[locale];

  const fail = async (error: { message?: string } | null) => {
    const text = error?.message ?? "";
    if (text.includes("non collegato")) return answerTelegramCallback(cb.id, m.bot.needAccount, true);
    return answerTelegramCallback(cb.id, m.errors.db[text] ?? m.bot.actionFailed, true);
  };

  // Presenza: a|<gruppo>|<AAAAMMGG>|<y/m/n>
  if (parts[0] === "a" && parts.length === 4 && STATUS[parts[3]] && /^\d{8}$/.test(parts[2])) {
    const [, groupId, d, s] = parts;
    const originalDate = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    const { error } = await admin.rpc("telegram_set_attendance", {
      p_telegram_user_id: String(cb.from.id),
      p_group_id: groupId,
      p_original_date: originalDate,
      p_status: STATUS[s],
    });
    if (error) return fail(error);
    await answerTelegramCallback(cb.id, s === "y" ? m.bot.savedYes : s === "m" ? m.bot.savedMaybe : m.bot.savedNo);

    // Aggiorna il riepilogo con la nuova risposta.
    const group = await loadBotGroup(admin, groupId);
    if (!group || !cb.message || !chatId) return;
    const data = await loadBotMeetings(admin, [groupId], originalDate);
    const meeting = nextMeetingByDate(group, data, originalDate);
    if (!meeting) return;
    const lines = (cb.message.text ?? "").split("\n");
    const title = lines[0] || group.name;
    // Il riepilogo di /chi mostra solo data e persone.
    const peopleOnly = Object.values(MESSAGES).some((x) => title.startsWith(x.bot.whoTitle.trim()));
    const html = `<b>${esc(title)}</b>\n${meetingSummaryHtml(group, meeting, data, m, locale, peopleOnly)}`;
    const keyboard = meetingMessage("", group, meeting, data, m, locale).keyboard;
    await editTelegramMessage(chatId, cb.message.message_id, html, keyboard);
    return;
  }

  // Voto: v|<proposta>|<posizione o x>
  if (parts[0] === "v" && parts.length === 3 && (parts[2] === "x" || /^\d+$/.test(parts[2]))) {
    const [, proposalId, pos] = parts;
    const { data: chosen, error } = await admin.rpc("telegram_toggle_vote", {
      p_telegram_user_id: String(cb.from.id),
      p_proposal_id: proposalId,
      p_position: pos === "x" ? null : Number(pos),
    });
    if (error) return fail(error);
    await answerTelegramCallback(cb.id, m.bot.voted(Array.isArray(chosen) ? chosen.length : 0));

    const proposal = await loadProposal(admin, proposalId);
    if (!proposal?.occurrences || !cb.message || !chatId) return;
    const group = await loadBotGroup(admin, proposal.occurrences.group_id);
    if (!group) return;
    const msg = proposalMessage(proposal, group, m, locale);
    await editTelegramMessage(chatId, cb.message.message_id, msg.html, msg.keyboard);
    return;
  }

  await answerTelegramCallback(cb.id, m.bot.actionFailed);
}

function nextMeetingByDate(group: BotGroup, data: BotMeetings, originalDate: string) {
  // L'incontro può essere stato spostato: si cerca per data originale.
  const today = todayInTimeZone(group.timezone);
  return groupMeetings(group, data, today, addDays(today, 366)).find((x) => x.originalDate === originalDate);
}
