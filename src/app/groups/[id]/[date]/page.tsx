import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { promoteGuest, removeGuest } from "@/app/guests/actions";
import { AttendanceButtons } from "@/components/attendance-buttons";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { GuestLinkBox } from "@/components/guest-link-box";
import { LiveRefresh } from "@/components/live-refresh";
import { AttendanceSummary } from "@/components/meeting-card";
import { ProposalCard } from "@/components/proposal-card";
import { Badge, ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { isDate } from "@/lib/form";
import { APPROVAL_RULE_LABELS, MODE_LABELS } from "@/lib/groups";
import { getMeetingContext, type Participant } from "@/lib/meeting-context";
import {
  ATTENDANCE_LABELS,
  meetingForDate,
  OCCURRENCE_SELECT,
  type AttendanceStatus,
  type OccurrenceRow,
} from "@/lib/meetings";
import { fetchProposals } from "@/lib/proposals";
import { closeDueProposals } from "@/lib/proposals-server";
import {
  capitalize,
  formatMediumDate,
  formatShortDate,
  formatTime,
  relativeDay,
} from "@/lib/schedule";
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
  const ctx = await getMeetingContext(supabase, id, date, user.id);
  if (!ctx) notFound();
  const { group, viewer, participants } = ctx;

  await closeDueProposals(supabase);
  const { data: occurrence } = await supabase
    .from("occurrences")
    .select(OCCURRENCE_SELECT)
    .eq("group_id", id)
    .eq("original_date", date)
    .maybeSingle();
  const occ = (occurrence ?? undefined) as OccurrenceRow | undefined;

  const meeting = meetingForDate(
    { ...group, memberCount: ctx.memberCount },
    date,
    occ,
    user.id,
  );
  if (!meeting) notFound();

  const isOwner = viewer === "owner";
  const isGuest = viewer === "guest";
  const isPast = meeting.date < meeting.today;
  const proposals = occ ? await fetchProposals(supabase, occ.id) : [];

  const byId = new Map(participants.map((p) => [p.user_id, p]));
  const nameRecord = Object.fromEntries(participants.map((p) => [p.user_id, p.name]));
  const byStatus = (status: AttendanceStatus) =>
    meeting.attendances
      .filter((a) => a.status === status)
      .map((a) => ({
        id: a.user_id,
        name: byId.get(a.user_id)?.name ?? "Ex partecipante",
        note: a.note,
        guest: byId.get(a.user_id)?.role === "guest",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
  const answered = new Set(meeting.attendances.map((a) => a.user_id));
  const noAnswer = participants
    .filter((p) => !answered.has(p.user_id))
    .map((p) => ({ id: p.user_id, name: p.name, note: null, guest: p.role === "guest" }));
  const guests = participants.filter((p) => p.role === "guest");

  return (
    <Page
      title={capitalize(formatMediumDate(meeting.date))}
      subtitle={`${formatTime(meeting.startTime)} · ${relativeDay(meeting.date, meeting.today)} · ${group.name}`}
      back={isGuest ? { href: "/", label: "Home" } : { href: `/groups/${group.id}`, label: group.name }}
    >
      <LiveRefresh />

      {isGuest && (
        <p className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm">
          👋 Sei <strong>ospite</strong> di questo incontro di <strong>{group.name}</strong>.
        </p>
      )}

      {meeting.skipped && (
        <p className="rounded-xl border border-foreground/15 bg-foreground/5 p-3 text-sm">
          ⏭️ <strong>Questo incontro è stato saltato.</strong>
          {isOwner && " Puoi ripristinarlo qui sotto."}
        </p>
      )}

      {meeting.date !== meeting.originalDate && (
        <p className="rounded-xl border border-brand/30 bg-brand/10 p-3 text-sm">
          📅 Incontro spostato: era previsto per {formatShortDate(meeting.originalDate)}.
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
          {!isGuest && !isPast && !meeting.skipped && (
            <ButtonLink href={`/groups/${group.id}/${meeting.originalDate}/proponi`} small>
              + Proponi
            </ButtonLink>
          )}
        </div>
        {proposals === null ? (
          <p role="alert" className="text-sm text-red-500">
            Non è stato possibile caricare le proposte. Ricarica la pagina tra poco.
          </p>
        ) : proposals.length === 0 ? (
          <p className="text-sm text-foreground/60">
            {isGuest
              ? "Nessuna proposta per questo incontro."
              : "Nessuna proposta. Puoi proporre un cambio di data, di gioco o di saltare l'incontro."}
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

      {!isGuest && !isPast && !meeting.skipped && (
        <Card title={`Ospiti${guests.length ? ` (${guests.length})` : ""}`}>
          <div className="flex flex-col gap-4">
            {guests.length > 0 && (
              <GuestList
                guests={guests}
                groupId={group.id}
                originalDate={meeting.originalDate}
                canManage={isOwner}
              />
            )}
            <GuestLinkBox
              groupId={group.id}
              originalDate={meeting.originalDate}
              label={`${group.name} · ${formatShortDate(meeting.date)} ${formatTime(meeting.startTime)}`}
            />
          </div>
        </Card>
      )}

      {isGuest && !isPast && (
        <NavForm
          action={removeGuest.bind(null, group.id, meeting.originalDate, user.id, true)}
          className="self-start"
        >
          <SubmitButton
            variant="danger"
            small
            confirm="Vuoi davvero lasciare questo incontro? Non lo vedrai più."
          >
            Lascia l&apos;incontro
          </SubmitButton>
        </NavForm>
      )}

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
            gameOverride={occ?.game_title_override ?? null}
            locationOverride={occ?.location_override ?? null}
            notes={meeting.notes}
            defaultGame={group.default_game_title}
            defaultLocation={group.default_location}
          />
        </Card>
      )}
    </Page>
  );
}

function GuestList({
  guests,
  groupId,
  originalDate,
  canManage,
}: {
  guests: Participant[];
  groupId: string;
  originalDate: string;
  canManage: boolean;
}) {
  return (
    <ul className="flex flex-col divide-y divide-foreground/10">
      {guests.map((g) => (
        <li key={g.user_id} className="flex flex-col gap-2 py-2">
          <span>{g.name}</span>
          {canManage && (
            <div className="flex gap-2">
              <form action={promoteGuest.bind(null, groupId, g.user_id)}>
                <SubmitButton
                  variant="secondary"
                  small
                  confirm={`Aggiungere ${g.name} come membro del gruppo?`}
                >
                  Aggiungi al gruppo
                </SubmitButton>
              </form>
              <NavForm action={removeGuest.bind(null, groupId, originalDate, g.user_id, false)}>
                <SubmitButton
                  variant="danger"
                  small
                  confirm={`Rimuovere ${g.name} da questo incontro?`}
                >
                  Rimuovi
                </SubmitButton>
              </NavForm>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PeopleList({
  title,
  people,
  muted,
}: {
  title: string;
  people: { id: string; name: string; note: string | null; guest: boolean }[];
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
            {p.guest && (
              <>
                {" "}
                <Badge>ospite</Badge>
              </>
            )}
            {p.note && <span className="text-foreground/60"> — {p.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
