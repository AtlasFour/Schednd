import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { isLocale } from "@/i18n/config";
import { MESSAGES } from "@/i18n/messages";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeTelegramHtml, sendTelegramMessage, telegramWebhookSecret } from "@/lib/telegram";

type Chat = { id: number; type: "private" | "group" | "supergroup" | "channel"; title?: string };
type Update = {
  message?: {
    chat: Chat;
    text?: string;
    migrate_to_chat_id?: number;
    from?: { language_code?: string };
  };
  my_chat_member?: { chat: Chat; new_chat_member: { status: string } };
};

/** Comando per collegare la chat: /collega CODICE (o /start CODICE dal link). */
const LINK_COMMAND = /^\/(?:start|collega|link)(?:@\w+)?\s+([a-f0-9]{16})\b/i;

/**
 * Webhook del bot Telegram: Telegram chiama questo indirizzo per ogni
 * messaggio rivolto al bot. Collega le chat ai gruppi di Schednd.
 */
export async function POST(request: NextRequest) {
  const secret = telegramWebhookSecret();
  const given = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: true });

  const update = (await request.json().catch(() => null)) as Update | null;
  if (!update) return NextResponse.json({ ok: true });

  // Il bot è stato tolto dal gruppo: la chat si scollega.
  const member = update.my_chat_member;
  if (member && ["left", "kicked"].includes(member.new_chat_member.status)) {
    await admin.from("group_channels").delete().eq("provider", "telegram").eq("chat_id", String(member.chat.id));
    return NextResponse.json({ ok: true });
  }

  const message = update.message;
  if (!message) return NextResponse.json({ ok: true });
  const chatId = String(message.chat.id);

  // Il gruppo è diventato "supergruppo" e ha cambiato id.
  if (message.migrate_to_chat_id) {
    await admin
      .from("group_channels")
      .update({ chat_id: String(message.migrate_to_chat_id) })
      .eq("provider", "telegram")
      .eq("chat_id", chatId);
    return NextResponse.json({ ok: true });
  }

  const text = message.text?.trim() ?? "";
  if (!text.startsWith("/")) return NextResponse.json({ ok: true });
  const lang = message.from?.language_code?.startsWith("it") === false ? "en" : "it";
  let m = MESSAGES[lang];
  const isGroup = message.chat.type === "group" || message.chat.type === "supergroup";

  const match = LINK_COMMAND.exec(text);
  if (!match) {
    if (/^\/(start|help|aiuto)(@\w+)?\b/i.test(text)) {
      await sendTelegramMessage(chatId, escapeTelegramHtml(isGroup ? m.channels.botHelp : m.channels.botPrivate));
    }
    return NextResponse.json({ ok: true });
  }
  if (!isGroup) {
    await sendTelegramMessage(chatId, escapeTelegramHtml(m.channels.botPrivate));
    return NextResponse.json({ ok: true });
  }

  const { data: groupName, error } = await admin.rpc("link_channel", {
    p_code: match[1].toLowerCase(),
    p_provider: "telegram",
    p_chat_id: chatId,
    p_chat_title: message.chat.title ?? "Telegram",
  });
  if (error) console.error("link_channel", error);

  if (typeof groupName === "string") {
    const { data: channel } = await admin
      .from("group_channels")
      .select("locale")
      .eq("provider", "telegram")
      .eq("chat_id", chatId)
      .limit(1)
      .maybeSingle();
    if (channel && isLocale(channel.locale)) m = MESSAGES[channel.locale];
    await sendTelegramMessage(chatId, escapeTelegramHtml(m.channels.botLinked(groupName)));
  } else {
    await sendTelegramMessage(chatId, escapeTelegramHtml(m.channels.botInvalid));
  }
  return NextResponse.json({ ok: true });
}
