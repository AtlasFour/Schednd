import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { InviteBox } from "@/components/invite-box";
import { Badge, Card, Page, PageSkeleton } from "@/components/ui";
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

export const metadata: Metadata = { title: "Impostazioni gruppo" };

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
      title="Impostazioni"
      subtitle={group.name}
      back={{ href: `/groups/${group.id}`, label: group.name }}
    >
      <Card title="Dettagli del gruppo">
        <GroupInfoForm group={group} />
      </Card>

      <Card title="Ricorrenza">
        {schedule && (
          <p className="mb-4 text-sm text-foreground/70">
            Ora: <strong>{describeRecurrence(schedule)}</strong>. Per cambiare
            in modo permanente giorno, orario o frequenza, scegli la data del
            nuovo primo incontro.
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

      <Card title={`Membri (${group.memberships.length})`}>
        <ul className="flex flex-col divide-y divide-foreground/10">
          {group.memberships.map((m) => {
            const name = m.profiles?.display_name ?? "Utente";
            const isMe = m.user_id === user.id;
            return (
              <li key={m.user_id} className="flex flex-col gap-2 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {name}
                    {isMe && <span className="text-foreground/50"> (tu)</span>}
                  </span>
                  {m.role === "owner" && <Badge tone="brand">owner</Badge>}
                </div>
                {!isMe && (
                  <div className="flex gap-2">
                    <NavForm action={transferOwnership.bind(null, group.id, m.user_id)}>
                      <SubmitButton
                        variant="secondary"
                        small
                        confirm={`Vuoi rendere ${name} owner del gruppo? Tu diventerai un membro normale.`}
                      >
                        Rendi owner
                      </SubmitButton>
                    </NavForm>
                    <form action={removeMember.bind(null, group.id, m.user_id)}>
                      <SubmitButton
                        variant="danger"
                        small
                        confirm={`Vuoi rimuovere ${name} dal gruppo?`}
                      >
                        Rimuovi
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card title="Link d'invito">
        <InviteBox url={url} code={group.invite_code} groupName={group.name} />
        <form action={regenerateInviteCode.bind(null, group.id)} className="mt-4">
          <SubmitButton
            variant="ghost"
            small
            confirm="Il link attuale smetterà di funzionare. Continuare?"
          >
            ↻ Genera un nuovo link
          </SubmitButton>
        </form>
      </Card>

      <Card title="Zona pericolosa" className="border-red-500/30">
        <p className="mb-3 text-sm text-foreground/70">
          Eliminando il gruppo si perdono tutti i suoi dati, per tutti i membri.
          Se vuoi solo uscire, prima rendi owner un altro membro.
        </p>
        <NavForm action={deleteGroup.bind(null, group.id)}>
          <SubmitButton
            variant="danger"
            small
            confirm={`Eliminare definitivamente "${group.name}"? L'operazione non si può annullare.`}
          >
            Elimina il gruppo
          </SubmitButton>
        </NavForm>
      </Card>
    </Page>
  );
}
