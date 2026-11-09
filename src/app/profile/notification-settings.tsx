"use client";

import { useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
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
  const { m } = useI18n();
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
        setMessage({ error: m.notif.enableFailed });
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
      setMessage({ success: m.actions.pushDisabled });
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
        <p className="text-sm font-medium">{m.notif.thisDevice}</p>
        {state === "loading" && <p className="text-sm text-foreground/60">{m.notif.checking}</p>}
        {state === "unsupported" && (
          <p className="text-sm text-foreground/70">
            {m.notif.unsupported}
          </p>
        )}
        {state === "ios-install" && (
          <p className="text-sm text-foreground/70">
            {m.notif.iosBefore} <strong>{m.notif.iosShare}</strong> {m.notif.iosThen}{" "}
            <strong>{m.notif.iosAdd}</strong>
            {m.notif.iosAfter}
          </p>
        )}
        {state === "not-configured" && (
          <p className="text-sm text-foreground/70">
            {m.notif.notConfigured}{" "}
            <a href="/profile/configurazione" className="text-brand underline">
              {m.notif.seeConfig}
            </a>
            .
          </p>
        )}
        {state === "denied" && (
          <p className="text-sm text-foreground/70">
            {m.notif.denied}
          </p>
        )}
        {state === "off" && (
          <button
            type="button"
            disabled={pending}
            onClick={enable}
            className={`${buttonClass("primary", true)} self-start`}
          >
            {m.notif.enable}
          </button>
        )}
        {state === "on" && (
          <div className="flex flex-wrap gap-2">
            <span className="self-center text-sm text-emerald-600 dark:text-emerald-400">
              {m.notif.active}
            </span>
            <button type="button" disabled={pending} onClick={test} className={buttonClass("secondary", true)}>
              {m.notif.sendTest}
            </button>
            <button type="button" disabled={pending} onClick={disable} className={buttonClass("ghost", true)}>
              {m.notif.disable}
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
          <span className="font-medium">{m.notif.emailLabel}</span>
          <span className="block text-foreground/60">
            {emailAvailable
              ? m.notif.emailUseful
              : m.notif.emailUnavailable}
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
        {m.notif.whatYouGet}
      </p>
    </div>
  );
}
