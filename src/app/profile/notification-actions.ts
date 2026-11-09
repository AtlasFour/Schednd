"use server";

import { requireUser } from "@/lib/auth";
import { dbErrorMessage, type FormState } from "@/lib/form";
import { afterMutation } from "@/lib/revalidate";

type SubscriptionJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function savePushSubscription(
  subscription: SubscriptionJSON,
  userAgent: string,
): Promise<FormState> {
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { error: "Iscrizione alle notifiche non valida." };
  }
  const { supabase, user } = await requireUser();
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: userAgent.slice(0, 300),
  });
  if (error) {
    console.error("save_push_subscription", error);
    return { error: dbErrorMessage(error) };
  }
  // Chi attiva le notifiche su un dispositivo le vuole ricevere.
  await supabase.from("profiles").update({ notify_push: true }).eq("id", user.id);
  afterMutation();
  return { success: "Notifiche attivate su questo dispositivo." };
}

export async function deletePushSubscription(endpoint: string): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.error("deletePushSubscription", error);
    return { error: dbErrorMessage(error) };
  }
  afterMutation();
  return { success: "Notifiche disattivate su questo dispositivo." };
}

export async function sendTestNotification(): Promise<FormState> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("enqueue_test_notification");
  if (error) {
    console.error("enqueue_test_notification", error);
    return { error: dbErrorMessage(error) };
  }
  afterMutation();
  return { success: "Notifica di prova inviata: dovrebbe arrivare tra pochi secondi." };
}

export async function updateEmailNotifications(enabled: boolean): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ notify_email: enabled })
    .eq("id", user.id);
  if (error) {
    console.error("updateEmailNotifications", error);
    return { error: dbErrorMessage(error) };
  }
  afterMutation();
  return { success: enabled ? "Riceverai gli avvisi anche via email." : "Avvisi via email disattivati." };
}
