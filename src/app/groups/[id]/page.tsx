import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { InviteBox } from "@/components/invite-box";
import { NavForm } from "@/components/navigation";
import { LiveRefresh } from "@/components/live-refresh";
import { MeetingCard } from "@/components/meeting-card";
import { Badge, ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import {
  activeSchedule,
  getGroupDetail,
  inviteUrl,
} from "@/lib/groups";
import { fetchOccurrences, upcomingMeetings } from "@/lib/meetings";
import { closeDueProposals } from "@/lib/proposals-server";
import {
  addDays,
  capitalize,
  describeRecurrence,
  formatShortDate,
  formatTime,
  todayInTimeZone,
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
  const { locale, m: msg } = await getI18n();
  const group = await getGroupDetail(supabase, id);

  if (!group) notFound();

  const me = group.memberships.find((m) => m.user_id === user.id);
  const isOwner = me?.role === "owner";
  const schedule = activeSchedule(group);
  await closeDueProposals(supabase);
  const occurrences = await fetchOccurrences(
    supabase,
    [group.id],
    addDays(todayInTimeZone(group.timezone), -1),
  );
  const meetings = upcomingMeetings(
    { ...group, memberCount: group.memberships.length },
    occurrences,
    user.id,
    4,
  );
  const url = inviteUrl(await getSiteUrl(), group.invite_code);

  return (
    <Page
      title={group.name}
      subtitle={
        group.kind === "single"
          ? meetings[0]
            ? msg.events.singleSubtitle(
                msg.events.at(capitalize(formatShortDate(meetings[0].date, locale)), formatTime(meetings[0].startTime)),
              )
            : msg.events.kindSingle
          : schedule
            ? describeRecurrence(schedule, locale)
            : undefined
      }
      back={{ href: "/", label: msg.common.home }}
      actions={
        isOwner ? (
          <ButtonLink href={`/groups/${group.id}/settings`} variant="secondary" small>
            {msg.group.settings}
          </ButtonLink>
        ) : undefined
      }
    >
      <LiveRefresh />
      {nuovo && (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
          {msg.group.created}
        </p>
      )}

      {group.description && (
        <p className="whitespace-pre-line text-foreground/80">{group.description}</p>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{msg.group.upcoming}</h2>
        {meetings.length === 0 ? (
          <Card>
            <p className="text-sm text-foreground/60">{msg.group.noMeetings}</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {meetings.map((m) => (
              <li key={m.originalDate}>
                <MeetingCard meeting={m} showGroup={false} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwner && group.kind !== "single" && (
        <ButtonLink href={`/groups/${group.id}/nuovo-incontro`} variant="secondary" small className="self-start">
          {msg.events.addExtra}
        </ButtonLink>
      )}

      <ButtonLink href={`/groups/${group.id}/libreria`} variant="secondary" className="self-start">
        {msg.group.library}
      </ButtonLink>

      <Card title={msg.group.info}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-foreground/60">{msg.group.game}</dt>
          <dd>{group.default_game_title ?? "—"}</dd>
          <dt className="text-foreground/60">{msg.group.where}</dt>
          <dd>
            {msg.labels.mode[group.mode]}
            {group.default_location && ` · ${group.default_location}`}
          </dd>
          {group.online_link && (
            <>
              <dt className="text-foreground/60">{msg.group.link}</dt>
              <dd className="truncate">
                <a href={group.online_link} target="_blank" rel="noreferrer" className="text-brand underline">
                  {group.online_link}
                </a>
              </dd>
            </>
          )}
          <dt className="text-foreground/60">{msg.group.duration}</dt>
          <dd>{msg.labels.duration(group.duration_minutes)}</dd>
          <dt className="text-foreground/60">{msg.group.minimum}</dt>
          <dd>{msg.group.minimumValue(group.min_attendees)}</dd>
          <dt className="text-foreground/60">{msg.group.proposals}</dt>
          <dd>{msg.labels.approvalRule[group.approval_rule].label}</dd>
        </dl>
      </Card>

      <Card title={msg.group.members(group.memberships.length)}>
        <ul className="flex flex-col gap-2">
          {group.memberships.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between gap-2">
              <span>
                {m.profiles?.display_name ?? msg.common.user}
                {m.user_id === user.id && <span className="text-foreground/50"> {msg.common.you}</span>}
              </span>
              {m.role === "owner" && <Badge tone="brand">{msg.common.owner}</Badge>}
            </li>
          ))}
        </ul>
      </Card>

      <Card title={msg.group.inviteTitle}>
        <InviteBox url={url} code={group.invite_code} groupName={group.name} />
      </Card>

      {!isOwner && (
        <NavForm action={leaveGroup.bind(null, group.id)} className="self-start">
          <SubmitButton
            variant="danger"
            small
            confirm={msg.group.confirmLeave(group.name)}
          >
            {msg.group.leave}
          </SubmitButton>
        </NavForm>
      )}
    </Page>
  );
}
