"use server";

import { revalidateApp } from "@/lib/revalidate";
import { requireUser } from "@/lib/auth";
import { dbErrorMessage, getOptionalString, getString, type FormState } from "@/lib/form";

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const display_name = getString(formData, "display_name");
  if (!display_name) return { error: "Inserisci il tuo nome." };
  if (display_name.length > 50) return { error: "Il nome può avere al massimo 50 caratteri." };

  const timezone = getString(formData, "timezone") || "Europe/Rome";
  const bgg_username = getOptionalString(formData, "bgg_username");

  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name, timezone, bgg_username })
    .eq("id", user.id);

  if (error) {
    console.error("updateProfile", error);
    return { error: dbErrorMessage(error) };
  }

  revalidateApp();
  return { success: "Profilo aggiornato." };
}
