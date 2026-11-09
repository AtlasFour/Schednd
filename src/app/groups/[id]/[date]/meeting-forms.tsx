"use client";

import { useActionState } from "react";
import { saveAttendanceNote, updateOccurrence } from "@/app/meetings/actions";
import { FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Select, Textarea } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/form";
import type { AttendanceStatus } from "@/lib/meetings";

export function AttendanceNoteForm({
  groupId,
  originalDate,
  status,
  note,
}: {
  groupId: string;
  originalDate: string;
  status: AttendanceStatus;
  note: string | null;
}) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(
    saveAttendanceNote.bind(null, groupId, originalDate, status),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="note"
          aria-label={m.meetingForms.noteLabel}
          maxLength={200}
          defaultValue={note ?? ""}
          placeholder={m.meetingForms.notePlaceholder}
          className="h-9 text-sm"
        />
        <SubmitButton variant="secondary" small>
          {m.common.save}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function OccurrenceOwnerForm({
  groupId,
  originalDate,
  skipped,
  gameOverride,
  locationOverride,
  notes,
  defaultGame,
  defaultLocation,
}: {
  groupId: string;
  originalDate: string;
  skipped: boolean;
  gameOverride: string | null;
  locationOverride: string | null;
  notes: string | null;
  defaultGame: string | null;
  defaultLocation: string | null;
}) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(
    updateOccurrence.bind(null, groupId, originalDate),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={m.meetingForms.status} htmlFor="status">
        <Select id="status" name="status" defaultValue={skipped ? "skipped" : "scheduled"}>
          <option value="scheduled">{m.meetingForms.playing}</option>
          <option value="skipped">{m.meetingForms.skipped}</option>
        </Select>
      </Field>
      <Field
        label={m.meetingForms.gameForMeeting}
        htmlFor="game_title_override"
        hint={defaultGame ? m.meetingForms.ifEmpty(defaultGame) : undefined}
      >
        <Input
          id="game_title_override"
          name="game_title_override"
          maxLength={120}
          defaultValue={gameOverride ?? ""}
          placeholder={defaultGame ?? m.meetingForms.gamePlaceholder}
        />
      </Field>
      <Field
        label={m.meetingForms.locationForMeeting}
        htmlFor="location_override"
        hint={defaultLocation ? m.meetingForms.ifEmpty(defaultLocation) : m.meetingForms.locationHint}
      >
        <Input
          id="location_override"
          name="location_override"
          maxLength={200}
          defaultValue={locationOverride ?? ""}
          placeholder={defaultLocation ?? m.meetingForms.locationPlaceholder}
        />
      </Field>
      <Field label={m.meetingForms.noteForAll} htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          maxLength={1000}
          defaultValue={notes ?? ""}
          placeholder={m.meetingForms.noteForAllPlaceholder}
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={m.common.saving}>{m.common.save}</SubmitButton>
    </form>
  );
}
