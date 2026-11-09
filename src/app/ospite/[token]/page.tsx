import type { Metadata } from "next";
import { Suspense } from "react";
import { acceptGuestInvite } from "@/app/guests/actions";
import { SubmitButton } from "@/components/form";
import { ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { GroupMode } from "@/lib/groups";
import { MODE_LABELS } from "@/lib/groups";
import { capitalize, formatMediumDate, formatTime } from "@/lib/schedule";

export const metadata: Metadata = { title: "Invito a un incontro" };

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

  const { data } = await supabase.rpc("get_guest_invite_preview", { p_token: token });
  const invite = (data as GuestPreview[] | null)?.[0];

  if (!invite || invite.expired) {
    return (
      <Page title={invite?.expired ? "Incontro già passato" : "Invito non valido"} back={{ href: "/", label: "Home" }}>
        <p className="text-foreground/70">
          {invite?.expired
            ? "Questo incontro si è già svolto."
            : "Il link non è valido oppure è stato sostituito con uno nuovo. Chiedi a chi ti ha invitato di mandartelo di nuovo."}
        </p>
      </Page>
    );
  }

  const meetingHref = `/groups/${invite.group_id}/${invite.original_date}`;

  return (
    <Page title="Sei invitato a giocare! 🎲" back={{ href: "/", label: "Home" }}>
      <Card>
        <p className="text-sm text-foreground/60">{invite.group_name}</p>
        <h2 className="mt-1 text-xl font-semibold">
          {capitalize(formatMediumDate(invite.start_date))} · {formatTime(invite.start_time)}
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-foreground/60">Gioco</dt>
          <dd>{invite.game ?? "—"}</dd>
          <dt className="text-foreground/60">Dove</dt>
          <dd>
            {MODE_LABELS[invite.mode]}
            {invite.location && ` · ${invite.location}`}
          </dd>
          {invite.invited_by && (
            <>
              <dt className="text-foreground/60">Invito di</dt>
              <dd>{invite.invited_by}</dd>
            </>
          )}
        </dl>
        {invite.skipped && (
          <p className="mt-3 text-sm font-medium">⏭️ Attenzione: questo incontro è stato saltato.</p>
        )}
      </Card>

      {errore && (
        <p role="alert" className="text-sm text-red-500">
          Non è stato possibile accettare l&apos;invito. Riprova.
        </p>
      )}

      {invite.is_member || invite.is_guest ? (
        <ButtonLink href={meetingHref}>
          {invite.is_member ? "Fai già parte del gruppo: apri l'incontro" : "Apri l'incontro"}
        </ButtonLink>
      ) : (
        <form action={acceptGuestInvite.bind(null, token)} className="flex flex-col gap-2">
          <SubmitButton pendingLabel="Attendi…">Partecipa come ospite</SubmitButton>
          <p className="text-center text-xs text-foreground/55">
            Vedrai solo questo incontro: potrai segnare se ci sei e votare le proposte.
          </p>
        </form>
      )}
    </Page>
  );
}
