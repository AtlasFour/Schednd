import type { SupabaseClient } from "@supabase/supabase-js";
import { MESSAGES } from "@/i18n/messages";
import { isLocale } from "@/i18n/config";
import { escapeTelegramHtml, getTelegramToken, sendTelegramMessage } from "@/lib/telegram";
import { getPublicSiteUrl } from "./config";

type ChannelPost = {
  id: number;
  kind: string;
  title: string;
  body: string;
  url: string;
  provider: string;
  chat_id: string;
  locale: string;
};

/**
 * Invia gli avvisi in coda nelle chat di gruppo collegate (Telegram).
 * Restituisce quanti messaggi sono partiti.
 */
export async function processChannelOutbox(admin: SupabaseClient, limit = 100): Promise<number> {
  if (!getTelegramToken()) return 0;

  const { data, error } = await admin.rpc("claim_channel_posts", { p_limit: limit });
  if (error) {
    console.error("claim_channel_posts", error);
    return 0;
  }
  const rows = (data ?? []) as ChannelPost[];
  if (rows.length === 0) return 0;

  const site = getPublicSiteUrl();
  const sentIds: number[] = [];
  const failedIds: number[] = [];
  const goneChats = new Set<string>();
  let sent = 0;

  for (const row of rows) {
    if (goneChats.has(row.chat_id)) {
      sentIds.push(row.id);
      continue;
    }
    const m = MESSAGES[isLocale(row.locale) ? row.locale : "it"];
    const link = new URL(row.url, site).toString();
    // Il riepilogo dei promemoria è già formattato (HTML); gli altri testi no.
    const body = row.kind === "reminder" ? row.body : escapeTelegramHtml(row.body);
    const html =
      `<b>${escapeTelegramHtml(row.title)}</b>\n${body}\n\n` +
      `<a href="${escapeTelegramHtml(link)}">${escapeTelegramHtml(m.share.open)}</a>`;

    let chatId = row.chat_id;
    let result = await sendTelegramMessage(chatId, html);
    // Il gruppo è diventato "supergruppo": Telegram comunica il nuovo id.
    if (!result.ok && result.parameters?.migrate_to_chat_id) {
      const newId = String(result.parameters.migrate_to_chat_id);
      await admin.from("group_channels").update({ chat_id: newId }).eq("chat_id", chatId);
      chatId = newId;
      result = await sendTelegramMessage(chatId, html);
    }

    if (result.ok) {
      sent += 1;
      sentIds.push(row.id);
    } else if (
      result.error_code === 403 ||
      (result.error_code === 400 && /chat not found/i.test(result.description ?? ""))
    ) {
      // Bot rimosso dal gruppo o chat inesistente: la chat si scollega.
      console.error("telegram", result.error_code, result.description);
      goneChats.add(row.chat_id);
      sentIds.push(row.id);
    } else {
      console.error("telegram", result.error_code, result.description);
      failedIds.push(row.id);
    }
  }

  await Promise.all([
    sentIds.length
      ? admin.from("channel_outbox").update({ sent_at: new Date().toISOString() }).in("id", sentIds)
      : null,
    failedIds.length
      ? admin.from("channel_outbox").update({ claimed_at: null }).in("id", failedIds)
      : null,
    goneChats.size
      ? admin.from("group_channels").delete().eq("provider", "telegram").in("chat_id", [...goneChats])
      : null,
  ]);
  return sent;
}
