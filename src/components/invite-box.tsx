"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/client";
import { buttonClass } from "./ui";

export function InviteBox({ url, code, groupName }: { url: string; code: string; groupName: string }) {
  const [copied, setCopied] = useState(false);
  const { m } = useI18n();

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(m.common.copyPrompt, url);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: m.invite.shareTitle(groupName),
        text: m.invite.shareText(groupName),
        url,
      });
    } catch {
      // Condivisione annullata o non supportata.
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground/70">
        {m.invite.explainBefore}{" "}
        <strong className="font-mono tracking-wider">{code}</strong> {m.invite.explainAfter}
      </p>
      <p className="truncate rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs">{url}</p>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={buttonClass("secondary", true)}>
          {copied ? m.common.copied : m.common.copyLink}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={buttonClass("primary", true)}>
            {m.common.share}
          </button>
        )}
      </div>
    </div>
  );
}
