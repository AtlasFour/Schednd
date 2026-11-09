import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ButtonLink, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { isDate } from "@/lib/form";
import { getGroupDetail } from "@/lib/groups";
import { meetingForDate, OCCURRENCE_SELECT, type OccurrenceRow } from "@/lib/meetings";
import { isOpen } from "@/lib/proposals";
import { closeDueProposals } from "@/lib/proposals-server";
import { capitalize, formatMediumDate, formatTime, hoursUntil } from "@/lib/schedule";
import { ProposalForm } from "./proposal-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.propose.metaTitle };
}

export default function ProposePage(props: PageProps<"/groups/[id]/[date]/proponi">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Propose {...props} />
    </Suspense>
  );
}

async function Propose({ params }: PageProps<"/groups/[id]/[date]/proponi">) {
  const { id, date } = await params;
  if (!isDate(date)) notFound();

  const { supabase, user } = await requireUser();
  const { locale, m } = await getI18n();
  const group = await getGroupDetail(supabase, id);
  if (!group) notFound();
  await closeDueProposals(supabase);

  const { data: occurrence } = await supabase
    .from("occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("group_id", id)
    .eq("original_date", date)
    .maybeSingle();

  const occ = occurrence as OccurrenceRow | null;

  const meeting = meetingForDate(
    { ...group, memberCount: group.memberships.length },
    date,
    occ ?? undefined,
    user.id,
  );
  if (!meeting) notFound();

  const back = { href: `/groups/${id}/${date}`, label: m.propose.back };
  const title = m.propose.title;
  const subtitle = `${capitalize(formatMediumDate(meeting.date, locale))} · ${formatTime(meeting.startTime)} · ${group.name}`;

  // Si vota fino a 24 ore prima: dopo non si possono creare proposte.
  const tooLate = hoursUntil(meeting.date, meeting.startTime, group.timezone) <= 24;

  if (meeting.skipped || tooLate) {
    return (
      <Page title={title} subtitle={subtitle} back={back}>
        <p className="text-foreground/70">
          {meeting.skipped
            ? m.propose.skippedNoProposals
            : m.propose.tooLate}
        </p>
        <ButtonLink href={back.href} variant="secondary" className="self-start">
          {m.propose.backToMeeting}
        </ButtonLink>
      </Page>
    );
  }

  const disabledTypes = (occ?.proposals ?? [])
    .filter((p) => isOpen(p.status))
    .map((p) => p.type);

  // Suggerimenti: gioco attuale e libreria del gruppo (preferiti per primi).
  const { data: library } = await supabase.rpc("group_library", { p_group_id: id });
  const gameSuggestions = [
    group.default_game_title,
    meeting.game,
    ...((library ?? []) as { title: string }[]).map((g) => g.title),
  ].filter((g, i, all): g is string => !!g && all.indexOf(g) === i);

  return (
    <Page title={title} subtitle={subtitle} back={back}>
      <ProposalForm
        groupId={id}
        originalDate={date}
        defaultTime={meeting.startTime.slice(0, 5)}
        minDate={meeting.today}
        disabledTypes={disabledTypes}
        gameSuggestions={gameSuggestions}
      />
    </Page>
  );
}
