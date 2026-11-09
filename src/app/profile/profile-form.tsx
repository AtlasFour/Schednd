"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
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
  const { m } = useI18n();
  const [state, formAction] = useActionState(updateProfile, initialFormState);
  const timezones = TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES];

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={m.profile.displayName} htmlFor="display_name" hint={m.profile.displayNameHint}>
        <Input id="display_name" name="display_name" required maxLength={50} defaultValue={displayName} />
      </Field>
      <Field label={m.profile.timezone} htmlFor="timezone">
        <Select id="timezone" name="timezone" defaultValue={timezone}>
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={m.profile.bggUsername}
        htmlFor="bgg_username"
        hint={m.profile.bggUsernameHint}
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
      <SubmitButton pendingLabel={m.common.saving}>{m.common.save}</SubmitButton>
    </form>
  );
}
