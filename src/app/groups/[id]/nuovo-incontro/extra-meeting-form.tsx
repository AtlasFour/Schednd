"use client";

import { useActionState, useRef } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { useNavigateOnSuccess } from "@/components/navigation";
import { Field, Input, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/form";
import { createExtraMeeting } from "../../actions";

export function ExtraMeetingForm({
  groupId,
  minDate,
  defaultTime,
  defaultGame,
  defaultLocation,
}: {
  groupId: string;
  minDate: string;
  defaultTime: string;
  defaultGame: string | null;
  defaultLocation: string | null;
}) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(createExtraMeeting.bind(null, groupId), initialFormState);
  const formRef = useRef<HTMLFormElement>(null);
  useNavigateOnSuccess(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={m.events.extraDate} htmlFor="date">
          <Input id="date" name="date" type="date" required min={minDate} />
        </Field>
        <Field label={m.events.extraTime} htmlFor="time">
          <Input id="time" name="time" type="time" required defaultValue={defaultTime} />
        </Field>
      </div>
      <Field
        label={m.events.extraGame}
        htmlFor="game"
        hint={defaultGame ? m.meetingForms.ifEmpty(defaultGame) : undefined}
      >
        <Input id="game" name="game" maxLength={120} placeholder={defaultGame ?? m.meetingForms.gamePlaceholder} />
      </Field>
      <Field
        label={m.events.extraPlace}
        htmlFor="location"
        hint={defaultLocation ? m.meetingForms.ifEmpty(defaultLocation) : undefined}
      >
        <Input
          id="location"
          name="location"
          maxLength={200}
          placeholder={defaultLocation ?? m.meetingForms.locationPlaceholder}
        />
      </Field>
      <Field label={m.events.extraNote} htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={1000} placeholder={m.meetingForms.noteForAllPlaceholder} />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={m.events.extraCreating}>{m.events.extraCreate}</SubmitButton>
    </form>
  );
}
