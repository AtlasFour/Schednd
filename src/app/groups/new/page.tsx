import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { addDays, todayInTimeZone } from "@/lib/schedule";
import { CreateGroupForm } from "./create-group-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.groupForm.newTitle };
}

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
  const { m } = await getI18n();
  return (
    <Page title={m.groupForm.newTitle} back={{ href: "/", label: m.common.home }}>
      <CreateGroupForm defaultAnchorDate={addDays(today, 7)} minDate={today} />
    </Page>
  );
}
