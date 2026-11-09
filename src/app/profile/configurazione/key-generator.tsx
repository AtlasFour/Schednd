"use client";

import { useState } from "react";
import { buttonClass } from "@/components/ui";

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Keys = { publicKey: string; privateKey: string; cronSecret: string };

/**
 * Genera nel browser (Web Crypto) le chiavi VAPID per le notifiche push e un
 * segreto per il cron. Niente viene inviato al server: vanno copiate a mano
 * nelle variabili d'ambiente di Vercel.
 */
export function KeyGenerator() {
  const [keys, setKeys] = useState<Keys | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    try {
      const pair = await crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"],
      );
      const rawPublic = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
      const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
      const secret = crypto.getRandomValues(new Uint8Array(32));
      setKeys({
        publicKey: toBase64Url(rawPublic),
        privateKey: jwk.d ?? "",
        cronSecret: Array.from(secret, (b) => b.toString(16).padStart(2, "0")).join(""),
      });
    } catch {
      setError("Questo browser non riesce a generare le chiavi. Prova con Chrome.");
    }
  }

  if (!keys) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={generate} className={`${buttonClass("primary", true)} self-start`}>
          🔑 Genera le chiavi
        </button>
        {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <KeyRow name="NEXT_PUBLIC_VAPID_PUBLIC_KEY" value={keys.publicKey} />
      <KeyRow name="VAPID_PRIVATE_KEY" value={keys.privateKey} secret />
      <KeyRow name="CRON_SECRET" value={keys.cronSecret} secret />
      <p className="text-xs text-foreground/60">
        ⚠️ Queste chiavi esistono solo in questa pagina: copiale subito su Vercel. Se ricarichi
        la pagina ne verranno generate di nuove (andrebbero ricopiate tutte e tre, e chi aveva
        già attivato le notifiche dovrebbe riattivarle).
      </p>
    </div>
  );
}

function KeyRow({ name, value, secret }: { name: string; value: string; secret?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-xs font-semibold">
        {name}
        {secret && <span className="ml-2 font-sans font-normal text-red-500">segreta</span>}
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="h-9 min-w-0 flex-1 rounded-lg border border-foreground/15 bg-foreground/5 px-2 font-mono text-xs"
        />
        <button
          type="button"
          className={buttonClass("secondary", true)}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "✓" : "Copia"}
        </button>
      </div>
    </div>
  );
}
