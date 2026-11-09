"use client";

import { useState, useTransition } from "react";
import { getGuestInviteLink, regenerateGuestInviteLink } from "@/app/guests/actions";
import { useI18n } from "@/i18n/client";
import { buttonClass } from "./ui";

export function GuestLinkBox({
  groupId,
  originalDate,
  label,
}: {
  groupId: string;
  originalDate: string;
  /** Es. "Sessione D · sab 14 nov" */
  label: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const { m } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function load(regenerate: boolean) {
    setError(null);
    startTransition(async () => {
      const result = regenerate
        ? await regenerateGuestInviteLink(groupId, originalDate)
        : await getGuestInviteLink(groupId, originalDate);
      if (result.error) setError(result.error);
      else if (result.url) setUrl(result.url);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt(m.common.copyPrompt, url);
    }
  }

  async function share() {
    if (!url) return;
    try {
      await navigator.share({
        title: m.invite.guestShareTitle(label),
        text: m.invite.guestShareText(label),
        url,
      });
    } catch {
      // Condivisione annullata o non supportata.
    }
  }

  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  if (!url) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-foreground/70">
          {m.invite.guestExplain}
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => load(false)}
          className={`${buttonClass("secondary", true)} self-start`}
        >
          {pending ? m.common.wait : m.invite.createGuestLink}
        </button>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="truncate rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={buttonClass("secondary", true)}>
          {copied ? m.common.copied : m.common.copyLink}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={buttonClass("primary", true)}>
            {m.common.share}
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm(m.invite.confirmNewLink)) load(true);
          }}
          className={buttonClass("ghost", true)}
        >
          {m.invite.newLink}
        </button>
      </div>
      <p className="text-xs text-foreground/55">
        {m.invite.sameLinkMany}
      </p>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
