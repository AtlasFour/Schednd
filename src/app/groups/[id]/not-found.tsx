import { ButtonLink, Page } from "@/components/ui";

export default function GroupNotFound() {
  return (
    <Page title="Gruppo non trovato">
      <p className="text-foreground/70">
        Il gruppo non esiste oppure non ne fai parte.
      </p>
      <ButtonLink href="/" variant="secondary" className="self-start">
        Torna alla home
      </ButtonLink>
    </Page>
  );
}
