"use client";

import { useState, useTransition } from "react";
import { getGuestInviteLink, regenerateGuestInviteLink } from "@/app/guests/actions";
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
      window.prompt("Copia il link:", url);
    }
  }

  async function share() {
    if (!url) return;
    try {
      await navigator.share({
        title: `Sei invitato: ${label}`,
        text: `Ti invito a giocare con noi (${label}). Segna se ci sei:`,
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
          Invita qualcuno solo a questo incontro: vedrà data, luogo e chi c&apos;è,
          potrà segnare la presenza e votare le proposte, ma non entrerà nel gruppo.
        </p>
        <button
          type="button"
          disabled={pending}
          onClick={() => load(false)}
          className={`${buttonClass("secondary", true)} self-start`}
        >
          {pending ? "Attendi…" : "🔗 Crea link per un ospite"}
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
          {copied ? "Copiato ✓" : "Copia link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={buttonClass("primary", true)}>
            Condividi
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Il link attuale smetterà di funzionare. Continuare?")) load(true);
          }}
          className={buttonClass("ghost", true)}
        >
          ↻ Nuovo link
        </button>
      </div>
      <p className="text-xs text-foreground/55">
        Lo stesso link vale per più persone, fino al giorno dell&apos;incontro.
      </p>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
