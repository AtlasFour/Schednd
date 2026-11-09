import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { signOut } from "../actions";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Profilo" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, timezone, bgg_username")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <Page title="Profilo" subtitle={user.email} back={{ href: "/", label: "Home" }}>
      <Card>
        <ProfileForm
          displayName={profile?.display_name ?? ""}
          timezone={profile?.timezone ?? "Europe/Rome"}
          bggUsername={profile?.bgg_username ?? null}
        />
      </Card>
      <form action={signOut} className="self-start">
        <SubmitButton variant="secondary" small>
          Esci dall&apos;account
        </SubmitButton>
      </form>
    </Page>
  );
}
