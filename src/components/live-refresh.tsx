"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Ricarica i dati della pagina quando qualcuno cambia presenze, incontri o proposte
 * (Supabase Realtime). Le regole di accesso del database fanno arrivare
 * solo gli eventi dei gruppi di cui si fa parte.
 */
export function LiveRefresh() {
  const router = useRouter();

  // Quando si torna sull'app (es. riaprendola dal telefono) i dati si
  // ricaricano: gli eventi in tempo reale non arrivano a schermo spento.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [router]);

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase
      .channel("live-meetings")
      .on("postgres_changes", { event: "*", schema: "public", table: "attendances" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "occurrences" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "proposals" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "ballots" }, scheduleRefresh)
      .subscribe();

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
