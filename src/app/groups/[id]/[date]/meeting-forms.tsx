"use client";

import { useActionState } from "react";
import { saveAttendanceNote, updateOccurrence } from "@/app/meetings/actions";
import { FormMessage, SubmitButton } from "@/components/form";
import { Field, Input, Select, Textarea } from "@/components/ui";
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
  const [state, formAction] = useActionState(
    saveAttendanceNote.bind(null, groupId, originalDate, status),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="note"
          aria-label="Nota per gli altri"
          maxLength={200}
          defaultValue={note ?? ""}
          placeholder="Nota, es. arrivo alle 22"
          className="h-9 text-sm"
        />
        <SubmitButton variant="secondary" small>
          Salva
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
  const [state, formAction] = useActionState(
    updateOccurrence.bind(null, groupId, originalDate),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Stato" htmlFor="status">
        <Select id="status" name="status" defaultValue={skipped ? "skipped" : "scheduled"}>
          <option value="scheduled">Si gioca</option>
          <option value="skipped">Saltato</option>
        </Select>
      </Field>
      <Field
        label="Gioco per questo incontro"
        htmlFor="game_title_override"
        hint={defaultGame ? `Se vuoto: ${defaultGame}` : undefined}
      >
        <Input
          id="game_title_override"
          name="game_title_override"
          maxLength={120}
          defaultValue={gameOverride ?? ""}
          placeholder={defaultGame ?? "es. Catan"}
        />
      </Field>
      <Field
        label="Luogo per questo incontro"
        htmlFor="location_override"
        hint={defaultLocation ? `Se vuoto: ${defaultLocation}` : "Utile se l'host cambia."}
      >
        <Input
          id="location_override"
          name="location_override"
          maxLength={200}
          defaultValue={locationOverride ?? ""}
          placeholder={defaultLocation ?? "es. Da Giulia"}
        />
      </Field>
      <Field label="Nota per tutti" htmlFor="notes">
        <Textarea
          id="notes"
          name="notes"
          maxLength={1000}
          defaultValue={notes ?? ""}
          placeholder="es. Portate i dadi, finiamo il dungeon"
        />
      </Field>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Salvataggio…">Salva</SubmitButton>
    </form>
  );
}
