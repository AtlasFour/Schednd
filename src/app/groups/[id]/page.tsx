import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { InviteBox } from "@/components/invite-box";
import { Badge, ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  activeSchedule,
  APPROVAL_RULE_LABELS,
  formatDuration,
  getGroupDetail,
  inviteUrl,
  MODE_LABELS,
  nextDates,
} from "@/lib/groups";
import {
  describeRecurrence,
  formatMediumDate,
  formatTime,
  relativeDay,
} from "@/lib/schedule";
import { getSiteUrl } from "@/lib/site-url";
import { leaveGroup } from "../actions";

export default function GroupPage(props: PageProps<"/groups/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GroupDetail {...props} />
    </Suspense>
  );
}

async function GroupDetail({ params, searchParams }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  const { nuovo } = await searchParams;
  const { supabase, user } = await requireUser();
  const group = await getGroupDetail(supabase, id);

  if (!group) notFound();

  const me = group.memberships.find((m) => m.user_id === user.id);
  const isOwner = me?.role === "owner";
  const schedule = activeSchedule(group);
  const { today, dates } = nextDates(group, 4);
  const url = inviteUrl(await getSiteUrl(), group.invite_code);

  return (
    <Page
      title={group.name}
      subtitle={schedule ? describeRecurrence(schedule) : undefined}
      back={{ href: "/", label: "Home" }}
      actions={
        isOwner ? (
          <ButtonLink href={`/groups/${group.id}/settings`} variant="secondary" small>
            ⚙️ Impostazioni
          </ButtonLink>
        ) : undefined
      }
    >
      {nuovo && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          🎉 Gruppo creato! Ora invita i tuoi amici con il link qui sotto.
        </p>
      )}

      {group.description && (
        <p className="whitespace-pre-line text-foreground/80">{group.description}</p>
      )}

      <Card title="Prossimi incontri">
        {dates.length === 0 ? (
          <p className="text-sm text-foreground/60">Nessun incontro in programma.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-foreground/10">
            {dates.map((d) => (
              <li key={d.date} className="flex items-center justify-between gap-3 py-2">
                <span className="first-letter:uppercase">{formatMediumDate(d.date)}</span>
                <span className="shrink-0 text-right text-sm text-foreground/60">
                  {formatTime(d.startTime)} · {relativeDay(d.date, today)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-foreground/50">
          Presenze e proposte per ogni incontro arrivano nella prossima versione.
        </p>
      </Card>

      <Card title="Info">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground/60">Gioco</dt>
          <dd>{group.default_game_title ?? "—"}</dd>
          <dt className="text-foreground/60">Dove</dt>
          <dd>
            {MODE_LABELS[group.mode]}
            {group.default_location && ` · ${group.default_location}`}
          </dd>
          {group.online_link && (
            <>
              <dt className="text-foreground/60">Link</dt>
              <dd className="truncate">
                <a href={group.online_link} target="_blank" rel="noreferrer" className="text-brand underline">
                  {group.online_link}
                </a>
              </dd>
            </>
          )}
          <dt className="text-foreground/60">Durata</dt>
          <dd>{formatDuration(group.duration_minutes)}</dd>
          <dt className="text-foreground/60">Minimo</dt>
          <dd>{group.min_attendees ? `${group.min_attendees} presenti` : "nessuno"}</dd>
          <dt className="text-foreground/60">Proposte</dt>
          <dd>{APPROVAL_RULE_LABELS[group.approval_rule].label}</dd>
        </dl>
      </Card>

      <Card title={`Membri (${group.memberships.length})`}>
        <ul className="flex flex-col gap-2">
          {group.memberships.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2">
              <span>
                {m.profiles?.display_name ?? "Utente"}
                {m.user_id === user.id && <span className="text-foreground/50"> (tu)</span>}
              </span>
              {m.role === "owner" && <Badge tone="brand">owner</Badge>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Invita nel gruppo">
        <InviteBox url={url} code={group.invite_code} groupName={group.name} />
      </Card>

      {!isOwner && (
        <form action={leaveGroup.bind(null, group.id)} className="self-start">
          <SubmitButton
            variant="danger"
            small
            confirm={`Vuoi davvero uscire da "${group.name}"?`}
          >
            Esci dal gruppo
          </SubmitButton>
        </form>
      )}
    </Page>
  );
}
