"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { FormMessage } from "@/components/form";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { FormState } from "@/lib/form";
import { createTelegramAccountLink, setTelegramPrivate, unlinkTelegramAccount } from "./actions";

type Account = { telegram_username: string | null; notify_private: boolean };

/** Collegamento dell'account Telegram personale (pulsanti del bot e avvisi privati). */
export function TelegramAccount({ account }: { account: Account | null }) {
  const { m } = useI18n();
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [privateOn, setPrivateOn] = useOptimistic(account?.notify_private ?? false);

  const connect = () =>
    startTransition(async () => {
      setMessage({});
      const r = await createTelegramAccountLink();
      if (r.url) setLink(r.url);
      else setMessage({ error: r.error });
    });

  if (!account) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/70">{m.bot.profileIntro}</p>
        {link ? (
          <>
            <a href={link} target="_blank" rel="noreferrer" className={buttonClass("primary", true)}>
              {m.bot.profileOpen}
            </a>
            <p className="text-xs text-foreground/60">{m.bot.profileAfter}</p>
            <button type="button" className={buttonClass("secondary", true)} onClick={() => router.refresh()}>
              {m.channels.refresh}
            </button>
          </>
        ) : (
          <button type="button" disabled={pending} onClick={connect} className={`${buttonClass("primary", true)} self-start`}>
            {pending ? m.channels.connecting : m.bot.profileLink}
          </button>
        )}
        <FormMessage state={message} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{m.bot.profileLinkedAs(account.telegram_username ? `@${account.telegram_username}` : "Telegram")}</p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={privateOn}
          className="mt-0.5 size-4 accent-brand"
          onChange={(e) => {
            const on = e.target.checked;
            startTransition(async () => {
              setPrivateOn(on);
              setMessage(await setTelegramPrivate(on));
              router.refresh();
            });
          }}
        />
        {m.bot.profilePrivate}
      </label>
      <button
        type="button"
        disabled={pending}
        className={`${buttonClass("ghost", true)} self-start`}
        onClick={() => {
          if (window.confirm(m.bot.profileConfirmUnlink)) {
            startTransition(async () => setMessage(await unlinkTelegramAccount()));
          }
        }}
      >
        {m.bot.profileUnlink}
      </button>
      <FormMessage state={message} />
    </div>
  );
}
