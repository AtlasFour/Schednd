import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { InviteBox } from "@/components/invite-box";
import { Badge, Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { activeSchedule, getGroupDetail, inviteUrl, nextDates } from "@/lib/groups";
import { describeRecurrence } from "@/lib/schedule";
import { getSiteUrl } from "@/lib/site-url";
import {
  deleteGroup,
  regenerateInviteCode,
  removeMember,
  transferOwnership,
} from "../../actions";
import { GroupInfoForm, ScheduleForm } from "./settings-forms";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.settings.metaTitle };
}

export default function SettingsPage(props: PageProps<"/groups/[id]/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Settings {...props} />
    </Suspense>
  );
}

async function Settings({ params }: PageProps<"/groups/[id]/settings">) {
  const { id } = await params;
  const { supabase, user } = await requireUser();
  const { locale, m: msg } = await getI18n();
  const group = await getGroupDetail(supabase, id);

  if (!group) notFound();

  const isOwner = group.memberships.some(
    (m) => m.user_id === user.id && m.role === "owner",
  );
  if (!isOwner) redirect(`/groups/${id}`);

  const schedule = activeSchedule(group);
  const { today, dates } = nextDates(group, 1);
  const url = inviteUrl(await getSiteUrl(), group.invite_code);

  return (
    <Page
      title={msg.settings.title}
      subtitle={group.name}
      back={{ href: `/groups/${group.id}`, label: group.name }}
    >
      <Card title={msg.settings.details}>
        <GroupInfoForm group={group} />
      </Card>

      {group.kind !== "single" && (
        <Card title={msg.settings.schedule}>
        {schedule && (
          <p className="mb-4 text-sm text-foreground/70">
            {msg.settings.scheduleNow} <strong>{describeRecurrence(schedule, locale)}</strong>.{" "}
            {msg.settings.scheduleExplain}
          </p>
        )}
        <ScheduleForm
          groupId={group.id}
          anchorDate={dates[0]?.date ?? today}
          intervalWeeks={schedule?.intervalWeeks ?? 1}
          startTime={schedule?.startTime ?? "21:00"}
          minDate={today}
        />
      </Card>
      )}

      <Card title={msg.group.members(group.memberships.length)}>
        <ul className="flex flex-col divide-y divide-foreground/10">
          {group.memberships.map((m) => {
            const name = m.profiles?.display_name ?? msg.common.user;
            const isMe = m.user_id === user.id;
            return (
              <li key={m.user_id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {name}
                    {isMe && <span className="text-foreground/50"> (tu)</span>}
                  </span>
                  {m.role === "owner" && <Badge tone="brand">{msg.common.owner}</Badge>}
                </div>
                {!isMe && (
                  <div className="flex gap-2">
                    <NavForm action={transferOwnership.bind(null, group.id, m.user_id)}>
                      <SubmitButton
                        variant="secondary"
                        small
                        confirm={msg.settings.confirmMakeOwner(name)}
                      >
                        {msg.settings.makeOwner}
                      </SubmitButton>
                    </NavForm>
                    <form action={removeMember.bind(null, group.id, m.user_id)}>
                      <SubmitButton
                        variant="danger"
                        small
                        confirm={msg.settings.confirmRemove(name)}
                      >
                        {msg.settings.remove}
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title={msg.settings.inviteLink}>
        <InviteBox url={url} code={group.invite_code} groupName={group.name} />
        <form action={regenerateInviteCode.bind(null, group.id)} className="mt-4">
          <SubmitButton
            variant="ghost"
            small
            confirm={msg.settings.confirmNewLink}
          >
            {msg.settings.newLink}
          </SubmitButton>
        </form>
      </Card>

      <Card title={msg.settings.danger} className="border-red-500/30">
        <p className="mb-3 text-sm text-foreground/70">
          {msg.settings.dangerText}
        </p>
        <NavForm action={deleteGroup.bind(null, group.id)}>
          <SubmitButton
            variant="danger"
            small
            confirm={msg.settings.confirmDelete(group.name)}
          >
            {msg.settings.delete}
          </SubmitButton>
        </NavForm>
      </Card>
    </Page>
  );
}
