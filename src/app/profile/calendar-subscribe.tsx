"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { googleSubscribeUrl } from "@/lib/ics";
import { getCalendarLink } from "./actions";

/** Abbonamento al calendario personale da Google / Apple / Outlook. */
export function CalendarSubscribe() {
  const { m } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function load(regenerate: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await getCalendarLink(regenerate);
      if (result.error) setError(result.error);
      else if (result.url) setUrl(result.url);
    });
  }

  if (!url) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground/70">{m.events.calendarIntro}</p>
        <button
          type="button"
          disabled={pending}
          onClick={() => load(false)}
          className={`${buttonClass("primary", true)} self-start`}
        >
          {pending ? m.common.wait : m.events.calendarGetLink}
        </button>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  const webcal = url.replace(/^https?:\/\//, "webcal://");
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <a href={googleSubscribeUrl(url)} target="_blank" rel="noreferrer" className={buttonClass("primary", true)}>
          {m.events.calendarGoogle}
        </a>
        <a href={webcal} className={buttonClass("secondary", true)}>
          {m.events.calendarApple}
        </a>
      </div>
      <p className="truncate rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonClass("secondary", true)}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt(m.common.copyPrompt, url);
            }
          }}
        >
          {copied ? m.common.copied : m.events.calendarCopy}
        </button>
        <button
          type="button"
          disabled={pending}
          className={buttonClass("ghost", true)}
          onClick={() => {
            if (window.confirm(m.events.calendarConfirmRegenerate)) load(true);
          }}
        >
          {m.events.calendarRegenerate}
        </button>
      </div>
      <p className="text-xs text-foreground/55">
        {m.events.calendarPrivate} {m.events.calendarDelay}
      </p>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
