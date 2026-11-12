"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { afterMutation } from "@/lib/revalidate";
import { requireUser } from "@/lib/auth";
import { getSiteUrl } from "@/lib/site-url";
import { getPublicSiteUrl } from "@/lib/notifications/config";
import {
  ensureTelegramWebhook,
  escapeTelegramHtml,
  getBotUsername,
  getTelegramToken,
  sendTelegramMessage,
} from "@/lib/telegram";
import {getOptionalString, getString, type FormState} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { m } = await getI18n();
  const display_name = getString(formData, "display_name");
  if (!display_name) return { error: m.actions.nameRequired };
  if (display_name.length > 50) return { error: m.actions.nameTooLong50 };

  const timezone = getString(formData, "timezone") || "Europe/Rome";
  const bgg_username = getOptionalString(formData, "bgg_username");

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name, timezone, bgg_username })
    .eq("id", user.id);

  if (error) {
    console.error("updateProfile", error);
    return { error: await dbErrorMessage(error) };
  }

  afterMutation();
  return { success: m.actions.profileUpdated };
}

/** Cambia la lingua: nel profilo (per le notifiche) e nel cookie del dispositivo. */
export async function setLanguage(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ locale }).eq("id", user.id);
  if (error) console.error("setLanguage", error);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  afterMutation();
}

/** Link (https) al calendario personale; con regenerate il vecchio smette di funzionare. */
export async function getCalendarLink(regenerate = false): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("get_calendar_token", { p_regenerate: regenerate });
  if (error || !data) {
    console.error("get_calendar_token", error);
    return { error: await dbErrorMessage(error) };
  }
  return { url: `${await getSiteUrl()}/api/calendar/${data}.ics` };
}

/** Prepara il collegamento dell'account Telegram (link al bot con codice). */
export async function createTelegramAccountLink(): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  if (!getTelegramToken()) return { error: m.channels.notConfigured };
  const { data: code, error } = await supabase.rpc("create_telegram_account_code");
  if (error || typeof code !== "string") return { error: await dbErrorMessage(error) };
  const [username] = await Promise.all([getBotUsername(), ensureTelegramWebhook(getPublicSiteUrl())]);
  if (!username) return { error: m.channels.notConfigured };
  return { url: `https://t.me/${username}?start=${code}` };
}

export async function setTelegramPrivate(on: boolean): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_telegram_private_notifications", { p_on: on });
  if (error) return { error: await dbErrorMessage(error) };
  return {};
}

export async function unlinkTelegramAccount(): Promise<FormState> {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { data: chatId, error } = await supabase.rpc("unlink_telegram_account");
  if (error) return { error: await dbErrorMessage(error) };
  if (typeof chatId === "string" && getTelegramToken()) {
    await sendTelegramMessage(chatId, escapeTelegramHtml(m.bot.accountUnlinked));
  }
  afterMutation();
  return {};
}
