"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Select } from "@/components/ui";
import { initialFormState } from "@/lib/form";
import { updateProfile } from "./actions";

const TIMEZONES = ["Europe/Rome", "Europe/London", "Europe/Paris", "Europe/Berlin", "UTC"];

export function ProfileForm({
  displayName,
  timezone,
  bggUsername,
}: {
  displayName: string;
  timezone: string;
  bggUsername: string | null;
}) {
  const [state, formAction] = useActionState(updateProfile, initialFormState);
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Nome visualizzato" htmlFor="display_name" hint="È il nome che vedono gli altri membri.">
        <Input id="display_name" name="display_name" required maxLength={50} defaultValue={displayName} />
      </Field>
      <Field label="Fuso orario" htmlFor="timezone">
        <Select id="timezone" name="timezone" defaultValue={timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Nome utente BoardGameGeek"
        htmlFor="bgg_username"
        hint="Facoltativo. Servirà per importare la tua collezione di giochi."
      >
        <Input
          id="bgg_username"
          name="bgg_username"
          maxLength={50}
          defaultValue={bggUsername ?? ""}
          autoCapitalize="none"
          autoCorrect="off"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Salvataggio…">Salva</SubmitButton>
    </form>
  );
}
