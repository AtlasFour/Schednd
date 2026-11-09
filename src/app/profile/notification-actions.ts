"use server";

import { requireUser } from "@/lib/auth";
import {type FormState} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";
import { afterMutation } from "@/lib/revalidate";

type SubscriptionJSON = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function savePushSubscription(
  subscription: SubscriptionJSON,
  userAgent: string,
): Promise<FormState> {
  const { m } = await getI18n();
  const { endpoint, keys } = subscription;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { error: m.actions.pushInvalid };
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
    return { error: await dbErrorMessage(error) };
  }
  // Chi attiva le notifiche su un dispositivo le vuole ricevere.
  await supabase.from("profiles").update({ notify_push: true }).eq("id", user.id);
  afterMutation();
  return { success: m.actions.pushEnabled };
}

export async function deletePushSubscription(endpoint: string): Promise<FormState> {
  const { m } = await getI18n();
  const { supabase } = await requireUser();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) {
    console.error("deletePushSubscription", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: m.actions.pushDisabled };
}

export async function sendTestNotification(): Promise<FormState> {
  const { m } = await getI18n();
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("enqueue_test_notification");
  if (error) {
    console.error("enqueue_test_notification", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: m.actions.testSent };
}

export async function updateEmailNotifications(enabled: boolean): Promise<FormState> {
  const { m } = await getI18n();
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ notify_email: enabled })
    .eq("id", user.id);
  if (error) {
    console.error("updateEmailNotifications", error);
    return { error: await dbErrorMessage(error) };
  }
  afterMutation();
  return { success: enabled ? m.actions.emailOn : m.actions.emailOff };
}
