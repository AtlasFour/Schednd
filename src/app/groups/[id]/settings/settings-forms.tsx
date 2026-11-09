"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { initialFormState } from "@/lib/form";
import type { GroupRow } from "@/lib/groups";
import { changeSchedule, updateGroup } from "../../actions";
import { GroupInfoFields, ScheduleFields } from "../../group-fields";

export function GroupInfoForm({ group }: { group: GroupRow }) {
  const [state, formAction] = useActionState(
    updateGroup.bind(null, group.id),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <GroupInfoFields group={group} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Salvataggio…">Salva</SubmitButton>
    </form>
  );
}

export function ScheduleForm({
  groupId,
  anchorDate,
  intervalWeeks,
  startTime,
  minDate,
}: {
  groupId: string;
  anchorDate: string;
  intervalWeeks: number;
  startTime: string;
  minDate: string;
}) {
  const [state, formAction] = useActionState(
    changeSchedule.bind(null, groupId),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <ScheduleFields
        anchorDate={anchorDate}
        intervalWeeks={intervalWeeks}
        startTime={startTime}
        minDate={minDate}
        dateLabel="Primo incontro con la nuova ricorrenza"
      />
      <FormMessage state={state} />
      <SubmitButton
        pendingLabel="Salvataggio…"
        confirm="Confermi il cambio di ricorrenza? Vale per tutti gli incontri da quella data in poi."
      >
        Cambia ricorrenza
      </SubmitButton>
    </form>
  );
}
