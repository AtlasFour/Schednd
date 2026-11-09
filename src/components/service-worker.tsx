"use client";

import { useEffect } from "react";

/** Registra il service worker (serve per le notifiche push e l'installazione). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
        console.error("Registrazione del service worker non riuscita", err);
      });
    }
  }, []);
  return null;
}
