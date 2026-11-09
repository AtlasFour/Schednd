import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { processNotificationQueue } from "./notifications/process";

/**
 * Chiude le proposte scadute nei gruppi dell'utente (solo server).
 * Chiudere una proposta mette in coda le notifiche dell'esito, che vengono
 * inviate dopo la risposta.
 */
export async function closeDueProposals(supabase: SupabaseClient) {
  const { data, error } = await supabase.rpc("close_due_proposals");
  if (error) console.error("close_due_proposals", error);
  if (typeof data === "number" && data > 0) {
    after(async () => {
      try {
        await processNotificationQueue();
      } catch (err) {
        console.error("processNotificationQueue", err);
      }
    });
  }
}
