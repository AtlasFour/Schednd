import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { joinGroup } from "../../groups/actions";

export const metadata: Metadata = { title: "Invito" };

type Preview = {
  group_id: string;
  name: string;
  description: string | null;
  member_count: number;
  is_member: boolean;
};

export default function JoinPage(props: PageProps<"/join/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Join {...props} />
    </Suspense>
  );
}

async function Join({ params, searchParams }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const { errore } = await searchParams;
  const { supabase } = await requireUser();

  const { data } = await supabase.rpc("get_invite_preview", { p_code: code });
  const preview = (data as Preview[] | null)?.[0];

  if (!preview) {
    return (
      <Page title="Invito non valido" back={{ href: "/", label: "Home" }}>
        <p className="text-foreground/70">
          Il link o il codice non è valido, oppure è stato sostituito con uno
          nuovo. Chiedi a chi ti ha invitato di mandartelo di nuovo.
        </p>
      </Page>
    );
  }

  return (
    <Page title="Sei stato invitato!" back={{ href: "/", label: "Home" }}>
      <Card>
        <h2 className="text-xl font-semibold">{preview.name}</h2>
        {preview.description && (
          <p className="mt-2 whitespace-pre-line text-sm text-foreground/70">
            {preview.description}
          </p>
        )}
        <p className="mt-3 text-sm text-foreground/60">
          {preview.member_count} {preview.member_count === 1 ? "membro" : "membri"}
        </p>
      </Card>

      {errore && (
        <p role="alert" className="text-sm text-red-500">
          Non è stato possibile entrare nel gruppo. Riprova.
        </p>
      )}

      {preview.is_member ? (
        <ButtonLink href={`/groups/${preview.group_id}`}>
          Fai già parte del gruppo: aprilo
        </ButtonLink>
      ) : (
        <NavForm action={joinGroup.bind(null, code)} className="flex flex-col">
          <SubmitButton pendingLabel="Ingresso…">Entra nel gruppo</SubmitButton>
        </NavForm>
      )}
    </Page>
  );
}
