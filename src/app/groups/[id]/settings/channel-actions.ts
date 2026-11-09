"use server";

import { dbErrorMessage, getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { getString, type FormState } from "@/lib/form";
import { getPublicSiteUrl } from "@/lib/notifications/config";
import { afterMutation } from "@/lib/revalidate";
import {
  ensureTelegramWebhook,
  escapeTelegramHtml,
  getBotUsername,
  getTelegramToken,
  sendTelegramMessage,
  telegramApi,
} from "@/lib/telegram";

const EVENTS = ["proposals", "outcomes", "changes", "game_on", "reminders"] as const;

/** Prepara il collegamento di una chat Telegram: link "aggiungi a un gruppo" e comando di riserva. */
export async function createTelegramLink(
  groupId: string,
): Promise<{ url?: string; command?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  if (!getTelegramToken()) return { error: m.channels.notConfigured };

  const { data: code, error } = await supabase.rpc("create_channel_link_code", { p_group_id: groupId });
  if (error || typeof code !== "string") return { error: await dbErrorMessage(error) };

  // Il webhook punta sempre al sito principale (le anteprime di Vercel sono protette).
  const [username] = await Promise.all([getBotUsername(), ensureTelegramWebhook(getPublicSiteUrl())]);
  if (!username) return { error: m.channels.notConfigured };
  return {
    url: `https://t.me/${username}?startgroup=${code}`,
    command: `/collega@${username} ${code}`,
  };
}

export async function saveChannelSettings(
  groupId: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const events = EVENTS.filter((e) => formData.get(`ev_${e}`) === "on");
  const [a, b] = await Promise.all([
    supabase.rpc("set_channel_events", { p_group_id: groupId, p_events: events }),
    supabase.rpc("set_channel_locale", { p_group_id: groupId, p_locale: getString(formData, "locale") }),
  ]);
  const error = a.error ?? b.error;
  if (error) return { error: await dbErrorMessage(error) };
  afterMutation();
  return { success: m.channels.saved };
}

export async function sendChannelTest(groupId: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { error } = await supabase.rpc("enqueue_channel_test", { p_group_id: groupId });
  if (error) return { error: await dbErrorMessage(error) };
  afterMutation(); // l'invio parte subito dopo la risposta
  return { success: m.channels.testSent };
}

export async function unlinkChannel(groupId: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { data: chatId, error } = await supabase.rpc("unlink_channel", { p_group_id: groupId });
  if (error) return { error: await dbErrorMessage(error) };
  if (typeof chatId === "string" && getTelegramToken()) {
    await sendTelegramMessage(chatId, escapeTelegramHtml(m.channels.botUnlinked));
    await telegramApi("leaveChat", { chat_id: chatId });
  }
  afterMutation();
  return {};
}
