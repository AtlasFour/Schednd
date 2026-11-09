"use client";

import { useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import type { FormState } from "@/lib/form";
import {
  deletePushSubscription,
  savePushSubscription,
  sendTestNotification,
  updateEmailNotifications,
} from "./notification-actions";

type PushState =
  | "loading"
  | "unsupported"
  | "ios-install"
  | "not-configured"
  | "denied"
  | "off"
  | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function NotificationSettings({
  vapidPublicKey,
  emailEnabled,
  emailAvailable,
}: {
  vapidPublicKey: string | null;
  emailEnabled: boolean;
  emailAvailable: boolean;
}) {
  const [state, setState] = useState<PushState>("loading");
  const [message, setMessage] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(emailEnabled);

  useEffect(() => {
    async function detect() {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (!vapidPublicKey) {
        setState("not-configured");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    }
    detect().catch(() => setState("unsupported"));
  }, [vapidPublicKey]);

  function enable() {
    if (!vapidPublicKey) return;
    setMessage({});
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.ready;
        const subscription =
          (await registration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }));
        const result = await savePushSubscription(subscription.toJSON(), navigator.userAgent);
        setMessage(result);
        if (!result.error) setState("on");
      } catch (err) {
        console.error(err);
        setMessage({ error: "Non è stato possibile attivare le notifiche su questo dispositivo." });
      }
    });
  }

  function disable() {
    setMessage({});
    startTransition(async () => {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      setMessage({ success: "Notifiche disattivate su questo dispositivo." });
    });
  }

  function test() {
    setMessage({});
    startTransition(async () => setMessage(await sendTestNotification()));
  }

  function toggleEmail(next: boolean) {
    setEmail(next);
    startTransition(async () => {
      const result = await updateEmailNotifications(next);
      setMessage(result);
      if (result.error) setEmail(!next);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Notifiche su questo dispositivo</p>
        {state === "loading" && <p className="text-sm text-foreground/60">Controllo…</p>}
        {state === "unsupported" && (
          <p className="text-sm text-foreground/70">
            Questo browser non supporta le notifiche push. Prova con Chrome su Android, oppure
            attiva gli avvisi via email qui sotto.
          </p>
        )}
        {state === "ios-install" && (
          <p className="text-sm text-foreground/70">
            Su iPhone le notifiche funzionano solo con l&apos;app installata: tocca{" "}
            <strong>Condividi</strong> ⬆️ e poi <strong>Aggiungi alla schermata Home</strong>,
            apri Schednd dall&apos;icona e torna qui.
          </p>
        )}
        {state === "not-configured" && (
          <p className="text-sm text-foreground/70">
            Le notifiche push non sono ancora configurate sul server.{" "}
            <a href="/profile/configurazione" className="text-brand underline">
              Vedi la configurazione
            </a>
            .
          </p>
        )}
        {state === "denied" && (
          <p className="text-sm text-foreground/70">
            Hai bloccato le notifiche per questo sito. Riattivale dalle impostazioni del browser
            (icona del lucchetto accanto all&apos;indirizzo → Notifiche → Consenti) e ricarica la
            pagina.
          </p>
        )}
        {state === "off" && (
          <button
            type="button"
            disabled={pending}
            onClick={enable}
            className={`${buttonClass("primary", true)} self-start`}
          >
            🔔 Attiva le notifiche
          </button>
        )}
        {state === "on" && (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm text-emerald-600 dark:text-emerald-400">
              ✓ Attive
            </span>
            <button type="button" disabled={pending} onClick={test} className={buttonClass("secondary", true)}>
              Invia una prova
            </button>
            <button type="button" disabled={pending} onClick={disable} className={buttonClass("ghost", true)}>
              Disattiva
            </button>
          </div>
        )}
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={email}
          disabled={pending || !emailAvailable}
          onChange={(e) => toggleEmail(e.target.checked)}
          className="mt-1 size-5 accent-[var(--brand)]"
        />
        <span className="text-sm">
          <span className="font-medium">Ricevi gli avvisi anche via email</span>
          <span className="block text-foreground/60">
            {emailAvailable
              ? "Utile se non puoi ricevere le notifiche push."
              : "Non disponibile: l'invio di email non è configurato sul server."}
          </span>
        </span>
      </label>

      {message.error && <p role="alert" className="text-sm text-red-500">{message.error}</p>}
      {message.success && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400">
          {message.success}
        </p>
      )}

      <p className="text-xs text-foreground/50">
        Ricevi un avviso per: nuove proposte e il loro esito, incontri saltati o spostati, minimo
        di presenti raggiunto, promemoria 2 giorni prima (se manca il minimo e non hai risposto) e il
        giorno prima (se hai detto che ci sei).
      </p>
    </div>
  );
}
