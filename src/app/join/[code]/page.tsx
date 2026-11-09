import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { NavForm } from "@/components/navigation";
import { ButtonLink, Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { joinGroup } from "../../groups/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.join.metaTitle };
}

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
  const { m } = await getI18n();

  const { data } = await supabase.rpc("get_invite_preview", { p_code: code });
  const preview = (data as Preview[] | null)?.[0];

  if (!preview) {
    return (
      <Page title={m.join.invalidTitle} back={{ href: "/", label: m.common.home }}>
        <p className="text-foreground/70">
          {m.join.invalidText}
        </p>
      </Page>
    );
  }

  return (
    <Page title={m.join.title} back={{ href: "/", label: m.common.home }}>
      <Card>
        <h2 className="text-xl font-semibold">{preview.name}</h2>
        {preview.description && (
          <p className="mt-2 whitespace-pre-line text-sm text-foreground/70">
            {preview.description}
          </p>
        )}
        <p className="mt-3 text-sm text-foreground/60">
          {m.common.members(preview.member_count)}
        </p>
      </Card>

      {errore && (
        <p role="alert" className="text-sm text-red-500">
          {m.join.error}
        </p>
      )}

      {preview.is_member ? (
        <ButtonLink href={`/groups/${preview.group_id}`}>
          {m.join.alreadyMember}
        </ButtonLink>
      ) : (
        <NavForm action={joinGroup.bind(null, code)} className="flex flex-col">
          <SubmitButton pendingLabel={m.join.joining}>{m.join.join}</SubmitButton>
        </NavForm>
      )}
    </Page>
  );
}
