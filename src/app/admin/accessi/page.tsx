import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Page, PageSkeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { requireUser } from "@/lib/auth";
import { AccessList, AddEmailForm, type AccessRow } from "./access-list";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.access.title };
}

export default function AccessPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Access />
    </Suspense>
  );
}

async function Access() {
  const { supabase } = await requireUser();
  const { m } = await getI18n();
  const { data, error } = await supabase.rpc("admin_list_access_requests");

  if (error) {
    return (
      <Page title={m.access.title} back={{ href: "/profile", label: m.common.profile }}>
        <Card>
          <p className="text-sm text-foreground/70">{m.access.notAdmin}</p>
        </Card>
      </Page>
    );
  }

  const rows = (data ?? []) as AccessRow[];
  const by = (status: AccessRow["status"]) => rows.filter((r) => r.status === status);

  return (
    <Page title={m.access.title} back={{ href: "/profile", label: m.common.profile }}>
      <p className="text-sm text-foreground/70">{m.access.intro}</p>
      <Card title={`${m.access.pending} (${by("pending").length})`}>
        <AccessList rows={by("pending")} />
      </Card>
      <Card title={m.access.addLabel}>
        <AddEmailForm />
      </Card>
      <Card title={`${m.access.approved} (${by("approved").length})`}>
        <AccessList rows={by("approved")} />
      </Card>
      {by("blocked").length > 0 && (
        <Card title={`${m.access.blockedList} (${by("blocked").length})`}>
          <AccessList rows={by("blocked")} />
        </Card>
      )}
    </Page>
  );
}
