import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Page, PageSkeleton } from "@/components/ui";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { CreateGroupForm } from "./create-group-form";

export const metadata: Metadata = { title: "Nuovo gruppo" };

export default function NewGroupPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewGroup />
    </Suspense>
  );
}

async function NewGroup() {
  await connection();
  const today = todayInTimeZone("Europe/Rome");
  return (
    <Page title="Nuovo gruppo" back={{ href: "/", label: "Home" }}>
      <CreateGroupForm defaultAnchorDate={addDays(today, 7)} minDate={today} />
    </Page>
  );
}
