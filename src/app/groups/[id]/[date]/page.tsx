import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { LiveRefresh } from "@/components/live-refresh";
import { AttendanceSummary } from "@/components/meeting-card";
import { ProposalCard } from "@/components/proposal-card";
import { ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isDate } from "@/lib/form";
import { APPROVAL_RULE_LABELS, getGroupDetail, MODE_LABELS } from "@/lib/groups";
import { closeDueProposals, fetchProposals } from "@/lib/proposals";
import {
  ATTENDANCE_LABELS,
  meetingForDate,
  OCCURRENCE_SELECT,
  type AttendanceStatus,
  type OccurrenceRow,
} from "@/lib/meetings";
import { capitalize, formatMediumDate, formatTime, relativeDay } from "@/lib/schedule";
import { AttendanceNoteForm, OccurrenceOwnerForm } from "./meeting-forms";

export const metadata: Metadata = { title: "Incontro" };

export default function MeetingPage(props: PageProps<"/groups/[id]/[date]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MeetingDetail {...props} />
    </Suspense>
  );
}

async function MeetingDetail({ params }: PageProps<"/groups/[id]/[date]">) {
  const { id, date } = await params;
  if (!isDate(date)) notFound();

  const { supabase, user } = await requireUser();
  const group = await getGroupDetail(supabase, id);
  if (!group) notFound();

  await closeDueProposals(supabase);
  const { data: occurrence } = await supabase
    .from("occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("group_id", id)
    .eq("original_date", date)
    .maybeSingle();

  const meeting = meetingForDate(
    { ...group, memberCount: group.memberships.length },
    date,
    (occurrence ?? undefined) as OccurrenceRow | undefined,
    user.id,
  );
  if (!meeting) notFound();

  const isOwner = group.memberships.some((m) => m.user_id === user.id && m.role === "owner");
  const isPast = meeting.date < meeting.today;
  const proposals = occurrence ? await fetchProposals(supabase, (occurrence as OccurrenceRow).id) : [];
  const nameRecord = Object.fromEntries(
    group.memberships.map((m) => [m.user_id, m.profiles?.display_name ?? "Utente"]),
  );

  const names = new Map(Object.entries(nameRecord));
  const byStatus = (status: AttendanceStatus) =>
    meeting.attendances
      .filter((a) => a.status === status)
      .map((a) => ({ id: a.user_id, name: names.get(a.user_id) ?? "Ex membro", note: a.note }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const answered = new Set(meeting.attendances.map((a) => a.user_id));
  const noAnswer = group.memberships
    .filter((m) => !answered.has(m.user_id))
    .map((m) => ({ id: m.user_id, name: m.profiles?.display_name ?? "Utente", note: null }));

  return (
    <Page
      title={capitalize(formatMediumDate(meeting.date))}
      subtitle={`${formatTime(meeting.startTime)} · ${relativeDay(meeting.date, meeting.today)} · ${group.name}`}
      back={{ href: `/groups/${group.id}`, label: group.name }}
    >
      <LiveRefresh />

      {meeting.skipped && (
        <p className="rounded-xl border border-foreground/15 bg-foreground/5 p-3 text-sm">
          ⏭️ <strong>Questo incontro è stato saltato.</strong>
          {isOwner && " Puoi ripristinarlo qui sotto."}
        </p>
      )}

      <Card>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground/60">Gioco</dt>
          <dd>{meeting.game ?? "—"}</dd>
          <dt className="text-foreground/60">Dove</dt>
          <dd>
            {MODE_LABELS[group.mode]}
            {meeting.location && ` · ${meeting.location}`}
          </dd>
          {group.online_link && (
            <>
              <dt className="text-foreground/60">Link</dt>
              <dd className="truncate">
                <a
                  href={group.online_link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  {group.online_link}
                </a>
              </dd>
            </>
          )}
        </dl>
        {meeting.notes && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-brand/10 p-3 text-sm">
            📌 {meeting.notes}
          </p>
        )}
      </Card>

      {!meeting.skipped && (
        <Card title={isPast ? "La tua presenza" : "Ci sei?"}>
          <div className="flex flex-col gap-3">
            <AttendanceButtons
              groupId={group.id}
              originalDate={meeting.originalDate}
              status={meeting.myStatus}
              disabled={isPast}
            />
            {isPast && (
              <p className="text-xs text-foreground/50">
                L&apos;incontro è passato: le presenze non si possono più cambiare.
              </p>
            )}
            {!isPast && meeting.myStatus && (
              <AttendanceNoteForm
                key={`${meeting.myStatus}-${meeting.myNote ?? ""}`}
                groupId={group.id}
                originalDate={meeting.originalDate}
                status={meeting.myStatus}
                note={meeting.myNote}
              />
            )}
          </div>
        </Card>
      )}

      <section id="proposte" className="flex scroll-mt-4 flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Proposte</h2>
          {!isPast && !meeting.skipped && (
            <ButtonLink href={`/groups/${group.id}/${meeting.originalDate}/proponi`} small>
              + Proponi
            </ButtonLink>
          )}
        </div>
        {proposals.length === 0 ? (
          <p className="text-sm text-foreground/60">
            Nessuna proposta. Puoi proporre un cambio di data, di gioco o di
            saltare l&apos;incontro.
          </p>
        ) : (
          proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              userId={user.id}
              isOwner={isOwner}
              ownerDecidesRule={group.approval_rule === "owner_decides"}
              names={nameRecord}
              timeZone={group.timezone}
            />
          ))
        )}
        <p className="text-xs text-foreground/50">
          Regola del gruppo: {APPROVAL_RULE_LABELS[group.approval_rule].label}.{" "}
          {APPROVAL_RULE_LABELS[group.approval_rule].hint}
        </p>
      </section>

      <Card title="Chi c'è">
        <div className="flex flex-col gap-4">
          <AttendanceSummary meeting={meeting} />
          <PeopleList title={`${ATTENDANCE_LABELS.yes.emoji} Ci sono`} people={byStatus("yes")} />
          <PeopleList title={`${ATTENDANCE_LABELS.maybe.emoji} Forse`} people={byStatus("maybe")} />
          <PeopleList title={`${ATTENDANCE_LABELS.no.emoji} Non ci sono`} people={byStatus("no")} />
          <PeopleList title="— Senza risposta" people={noAnswer} muted />
        </div>
      </Card>

      {isOwner && !isPast && (
        <Card title="Decisioni dell'owner">
          <p className="mb-4 text-sm text-foreground/70">
            Valgono solo per questo incontro. Ad esempio, se manca il minimo,
            puoi saltarlo o cambiare gioco per chi c&apos;è.
          </p>
          <OccurrenceOwnerForm
            groupId={group.id}
            originalDate={meeting.originalDate}
            skipped={meeting.skipped}
            gameOverride={(occurrence as OccurrenceRow | null)?.game_title_override ?? null}
            locationOverride={(occurrence as OccurrenceRow | null)?.location_override ?? null}
            notes={meeting.notes}
            defaultGame={group.default_game_title}
            defaultLocation={group.default_location}
          />
        </Card>
      )}
    </Page>
  );
}

function PeopleList({
  title,
  people,
  muted,
}: {
  title: string;
  people: { id: string; name: string; note: string | null }[];
  muted?: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <div>
      <h3 className="mb-1 text-sm font-medium">
        {title} <span className="text-foreground/50">({people.length})</span>
      </h3>
      <ul className="flex flex-col gap-1 text-sm">
        {people.map((p) => (
          <li key={p.id} className={muted ? "text-foreground/60" : undefined}>
            {p.name}
            {p.note && <span className="text-foreground/60"> — {p.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
