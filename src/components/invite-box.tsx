"use client";

import { useState } from "react";
import { buttonClass } from "./ui";

export function InviteBox({ url, code, groupName }: { url: string; code: string; groupName: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copia il link:", url);
    }
  }

  async function share() {
    try {
      await navigator.share({
        title: `Unisciti a ${groupName} su Schednd`,
        text: `Ti invito nel gruppo "${groupName}" su Schednd:`,
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
        Manda questo link a chi vuoi aggiungere al gruppo. In alternativa può
        inserire il codice <strong className="font-mono tracking-wider">{code}</strong>{" "}
        dalla home.
      </p>
      <p className="truncate rounded-lg bg-foreground/5 px-3 py-2 font-mono text-xs">{url}</p>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className={buttonClass("secondary", true)}>
          {copied ? "Copiato ✓" : "Copia link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={buttonClass("primary", true)}>
            Condividi
          </button>
        )}
      </div>
    </div>
  );
}
