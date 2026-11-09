import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { activeSchedule, getGroupDetail } from "@/lib/groups";
import { todayInTimeZone } from "@/lib/schedule";
import { ExtraMeetingForm } from "./extra-meeting-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.events.extraTitle };
}

export default function ExtraMeetingPage(props: PageProps<"/groups/[id]/nuovo-incontro">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ExtraMeeting {...props} />
    </Suspense>
  );
}

async function ExtraMeeting({ params }: PageProps<"/groups/[id]/nuovo-incontro">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { m } = await getI18n();
  const group = await getGroupDetail(supabase, id);
  if (!group) notFound();

  const isOwner = group.memberships.some((x) => x.user_id === user.id && x.role === "owner");
  if (!isOwner || group.kind === "single") redirect(`/groups/${id}`);

  return (
    <Page
      title={m.events.extraTitle}
      subtitle={group.name}
      back={{ href: `/groups/${id}`, label: group.name }}
    >
      <p className="text-sm text-foreground/70">{m.events.extraIntro}</p>
      <ExtraMeetingForm
        groupId={id}
        minDate={todayInTimeZone(group.timezone)}
        defaultTime={(activeSchedule(group)?.startTime ?? "21:00").slice(0, 5)}
        defaultGame={group.default_game_title}
        defaultLocation={group.default_location}
      />
    </Page>
  );
}
