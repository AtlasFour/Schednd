"use server";

import { afterMutation } from "@/lib/revalidate";
import { redirect, RedirectType } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  afterMutation();
  redirect("/login", RedirectType.replace);
}
