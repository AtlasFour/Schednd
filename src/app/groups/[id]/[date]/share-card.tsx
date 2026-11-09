"use client";

import { useState, useSyncExternalStore } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { whatsappShareUrl } from "@/lib/share-text";

/** Riepilogo dell'incontro da mandare nella chat del gruppo (WhatsApp o altre app). */
export function ShareCard({ text }: { text: string }) {
  const { m } = useI18n();
  const [copied, setCopied] = useState(false);
  // Sul server non si sa: il pulsante "Altre app" compare solo nel browser.
  const canShare = useSyncExternalStore(
    noop,
    () => "share" in navigator,
    () => false,
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/70">{m.share.hint}</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={whatsappShareUrl(text)}
          target="_blank"
          rel="noreferrer"
          className={`${buttonClass("primary", true)} !bg-[#25D366] !text-white`}
        >
          {m.share.whatsapp}
        </a>
        {canShare ? (
          <button
            type="button"
            className={buttonClass("secondary", true)}
            onClick={() => navigator.share({ text }).catch(() => {})}
          >
            {m.share.other}
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass("secondary", true)}
            onClick={async () => {
              await navigator.clipboard.writeText(text).catch(() => window.prompt("", text));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? m.share.copied : m.share.copy}
          </button>
        )}
      </div>
    </div>
  );
}

const noop = () => () => {};
