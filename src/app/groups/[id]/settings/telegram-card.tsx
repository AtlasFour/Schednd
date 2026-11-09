"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { buttonClass, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState, type FormState } from "@/lib/form";
import { createTelegramLink, saveChannelSettings, sendChannelTest, unlinkChannel } from "./channel-actions";

export type ChannelInfo = { chat_title: string | null; locale: string; events: string[] };

/** Collegamento della chat Telegram del gruppo (solo owner). */
export function TelegramCard({
  groupId,
  configured,
  channel,
}: {
  groupId: string;
  configured: boolean;
  channel: ChannelInfo | null;
}) {
  const { m } = useI18n();
  const router = useRouter();
  const [link, setLink] = useState<{ url: string; command: string } | null>(null);
  const [message, setMessage] = useState<FormState>({});
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const [state, formAction] = useActionState(saveChannelSettings.bind(null, groupId), initialFormState);

  if (!configured) {
    return (
      <p className="text-sm text-foreground/70">
        {m.channels.notConfigured}{" "}
        <a href="/profile/configurazione" className="text-brand underline">
          {m.channels.setupLink}
        </a>
      </p>
    );
  }

  const connect = () =>
    startTransition(async () => {
      setMessage({});
      const r = await createTelegramLink(groupId);
      if (r.url && r.command) setLink({ url: r.url, command: r.command });
      else setMessage({ error: r.error });
    });

  const run = (action: () => Promise<FormState>) =>
    startTransition(async () => setMessage(await action()));

  const instructions = link && (
    <div className="flex flex-col gap-3 rounded-xl bg-foreground/5 p-3 text-sm">
      <p>{m.channels.step1}</p>
      <a href={link.url} target="_blank" rel="noreferrer" className={buttonClass("primary", true)}>
        {m.channels.openTelegram}
      </a>
      <p>{m.channels.step2}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-background px-2 py-1 font-mono text-xs">{link.command}</code>
        <button
          type="button"
          className={buttonClass("secondary", true)}
          onClick={async () => {
            await navigator.clipboard.writeText(link.command).catch(() => window.prompt("", link.command));
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? m.share.copied : m.channels.copyCommand}
        </button>
      </div>
      <p className="text-xs text-foreground/60">{m.channels.codeExpires}</p>
      <p>{m.channels.step3}</p>
      <button type="button" className={buttonClass("secondary", true)} onClick={() => router.refresh()}>
        {m.channels.refresh}
      </button>
    </div>
  );

  if (!channel) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-foreground/70">{m.channels.intro}</p>
        {instructions ?? (
          <button type="button" disabled={pending} onClick={connect} className={`${buttonClass("primary", true)} self-start`}>
            {pending ? m.channels.connecting : m.channels.connect}
          </button>
        )}
        <FormMessage state={message} />
      </div>
    );
  }

  const options = [
    ["proposals", m.channels.evProposals],
    ["outcomes", m.channels.evOutcomes],
    ["changes", m.channels.evChanges],
    ["game_on", m.channels.evGameOn],
    ["reminders", m.channels.evReminders],
  ] as const;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium">✈️ {m.channels.linkedTo(channel.chat_title ?? "Telegram")}</p>
      <form action={formAction} className="flex flex-col gap-3">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{m.channels.eventsLabel}</legend>
          {options.map(([key, label]) => (
            <label key={key} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name={`ev_${key}`}
                defaultChecked={channel.events.includes(key)}
                className="mt-0.5 size-4 accent-brand"
              />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.channels.language}
          <Select name="locale" defaultValue={channel.locale}>
            <option value="it">🇮🇹 Italiano</option>
            <option value="en">🇬🇧 English</option>
          </Select>
        </label>
        <FormMessage state={state} />
        <SubmitButton small pendingLabel={m.common.saving}>
          {m.channels.save}
        </SubmitButton>
      </form>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          className={buttonClass("secondary", true)}
          onClick={() => run(() => sendChannelTest(groupId))}
        >
          {m.channels.test}
        </button>
        <button
          type="button"
          disabled={pending}
          className={buttonClass("ghost", true)}
          onClick={() => {
            if (window.confirm(m.channels.confirmUnlink)) run(() => unlinkChannel(groupId));
          }}
        >
          {m.channels.unlink}
        </button>
        {!link && (
          <button type="button" disabled={pending} className={buttonClass("ghost", true)} onClick={connect}>
            {m.channels.relink}
          </button>
        )}
      </div>
      {instructions}
      <FormMessage state={message} />
    </div>
  );
}
