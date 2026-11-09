import type { Metadata } from "next";
import { Suspense } from "react";
import { acceptGuestInvite } from "@/app/guests/actions";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import type { GroupMode } from "@/lib/groups";
import { capitalize, formatMediumDate, formatTime } from "@/lib/schedule";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.join.guestMetaTitle };
}

type GuestPreview = {
  group_id: string;
  group_name: string;
  original_date: string;
  start_date: string;
  start_time: string;
  game: string | null;
  location: string | null;
  mode: GroupMode;
  skipped: boolean;
  invited_by: string | null;
  is_member: boolean;
  is_guest: boolean;
  expired: boolean;
};

export default function GuestInvitePage(props: PageProps<"/ospite/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GuestInvite {...props} />
    </Suspense>
  );
}

async function GuestInvite({ params, searchParams }: PageProps<"/ospite/[token]">) {
  const { token } = await params;
  const { errore } = await searchParams;
  const { supabase } = await requireUser();
  const { locale, m } = await getI18n();

  const { data } = await supabase.rpc("get_guest_invite_preview", { p_token: token });
  const invite = (data as GuestPreview[] | null)?.[0];

  if (!invite || invite.expired) {
    return (
      <Page title={invite?.expired ? m.join.guestPastTitle : m.join.invalidTitle} back={{ href: "/", label: m.common.home }}>
        <p className="text-foreground/70">
          {invite?.expired
            ? m.join.guestPastText
            : m.join.guestInvalidText}
        </p>
      </Page>
    );
  }

  const meetingHref = `/groups/${invite.group_id}/${invite.original_date}`;

  return (
    <Page title={m.join.guestTitle} back={{ href: "/", label: m.common.home }}>
      <Card>
        <p className="text-sm text-foreground/60">{invite.group_name}</p>
        <h2 className="mt-1 text-xl font-semibold">
          {capitalize(formatMediumDate(invite.start_date, locale))} · {formatTime(invite.start_time)}
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-foreground/60">{m.join.game}</dt>
          <dd>{invite.game ?? "—"}</dd>
          <dt className="text-foreground/60">{m.join.where}</dt>
          <dd>
            {m.labels.mode[invite.mode]}
            {invite.location && ` · ${invite.location}`}
          </dd>
          {invite.invited_by && (
            <>
              <dt className="text-foreground/60">{m.join.invitedBy}</dt>
              <dd>{invite.invited_by}</dd>
            </>
          )}
        </dl>
        {invite.skipped && (
          <p className="mt-3 text-sm font-medium">{m.join.skippedWarning}</p>
        )}
      </Card>

      {errore && (
        <p role="alert" className="text-sm text-red-500">
          {m.join.guestError}
        </p>
      )}

      {invite.is_member || invite.is_guest ? (
        <ButtonLink href={meetingHref}>
          {invite.is_member ? m.join.openMeetingMember : m.join.openMeeting}
        </ButtonLink>
      ) : (
        <NavForm action={acceptGuestInvite.bind(null, token)} className="flex flex-col gap-2">
          <SubmitButton>{m.join.participate}</SubmitButton>
          <p className="text-center text-xs text-foreground/55">
            {m.join.guestExplain}
          </p>
        </NavForm>
      )}
    </Page>
  );
}
