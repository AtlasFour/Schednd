"use client";

import { useI18n } from "@/i18n/client";
import { ButtonLink, Page } from "@/components/ui";

export default function GroupNotFound() {
  const { m } = useI18n();
  return (
    <Page title={m.group.notFoundTitle}>
      <p className="text-foreground/70">{m.group.notFoundText}</p>
      <ButtonLink href="/" variant="secondary" className="self-start">
        {m.group.backHome}
      </ButtonLink>
    </Page>
  );
}
