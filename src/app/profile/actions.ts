"use server";

import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import { afterMutation } from "@/lib/revalidate";
import { requireUser } from "@/lib/auth";
import {getOptionalString, getString, type FormState} from "@/lib/form";
import { dbErrorMessage, getI18n } from "@/i18n/server";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const { m } = await getI18n();
  const display_name = getString(formData, "display_name");
  if (!display_name) return { error: m.actions.nameRequired };
  if (display_name.length > 50) return { error: m.actions.nameTooLong50 };

  const timezone = getString(formData, "timezone") || "Europe/Rome";
  const bgg_username = getOptionalString(formData, "bgg_username");

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name, timezone, bgg_username })
    .eq("id", user.id);

  if (error) {
    console.error("updateProfile", error);
    return { error: await dbErrorMessage(error) };
  }

  afterMutation();
  return { success: m.actions.profileUpdated };
}

/** Cambia la lingua: nel profilo (per le notifiche) e nel cookie del dispositivo. */
export async function setLanguage(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("profiles").update({ locale }).eq("id", user.id);
  if (error) console.error("setLanguage", error);
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  afterMutation();
}
