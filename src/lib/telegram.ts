import { createHash } from "node:crypto";

/**
 * Bot Telegram (API ufficiale https://core.telegram.org/bots/api).
 * Il token si crea con @BotFather e va messo nella variabile TELEGRAM_BOT_TOKEN
 * su Vercel. Solo sul server.
 */
export function getTelegramToken() {
  return process.env.TELEGRAM_BOT_TOKEN || null;
}

export type TelegramResult<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      error_code?: number;
      description?: string;
      parameters?: { migrate_to_chat_id?: number; retry_after?: number };
    };

export async function telegramApi<T = unknown>(
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResult<T>> {
  const token = getTelegramToken();
  if (!token) return { ok: false, description: "TELEGRAM_BOT_TOKEN non configurato" };
  try {
    const base = process.env.TELEGRAM_API_URL ?? "https://api.telegram.org";
    const res = await fetch(`${base}/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return (await res.json()) as TelegramResult<T>;
  } catch (err) {
    return { ok: false, description: (err as Error).message };
  }
}

/**
 * Segreto che Telegram rimanda in ogni chiamata al webhook: così solo
 * Telegram può parlare con /api/telegram. Ricavato dal token, niente variabili in più.
 */
export function telegramWebhookSecret() {
  const token = getTelegramToken();
  if (!token) return null;
  return createHash("sha256").update(`schednd-webhook:${token}`).digest("hex").slice(0, 48);
}

let cachedUsername: string | null = null;

/** Nome utente del bot (es. SchedndBot), letto da Telegram la prima volta. */
export async function getBotUsername() {
  if (cachedUsername) return cachedUsername;
  const r = await telegramApi<{ username: string }>("getMe", {});
  if (r.ok) cachedUsername = r.result.username;
  return cachedUsername;
}

/** Registra (o aggiorna) l'indirizzo a cui Telegram manda i messaggi per il bot. */
export async function ensureTelegramWebhook(siteUrl: string) {
  const secret = telegramWebhookSecret();
  if (!secret) return false;
  const r = await telegramApi("setWebhook", {
    url: `${siteUrl}/api/telegram`,
    secret_token: secret,
    allowed_updates: ["message", "my_chat_member", "callback_query"],
  });
  if (!r.ok) console.error("setWebhook", r.description);
  return r.ok;
}

export function escapeTelegramHtml(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export type InlineKeyboard = {
  inline_keyboard: ({ text: string; callback_data: string } | { text: string; url: string })[][];
};

export async function sendTelegramMessage(chatId: string, html: string, keyboard?: InlineKeyboard | null) {
  return telegramApi("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

export async function editTelegramMessage(
  chatId: string,
  messageId: number,
  html: string,
  keyboard?: InlineKeyboard | null,
) {
  return telegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}

/** Risposta al tocco di un pulsante (breve avviso in alto nella chat). */
export async function answerTelegramCallback(callbackId: string, text: string, alert = false) {
  return telegramApi("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: text.slice(0, 200),
    show_alert: alert,
  });
}
