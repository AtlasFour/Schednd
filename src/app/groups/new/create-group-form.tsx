"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Card } from "@/components/ui";
import { initialFormState } from "@/lib/form";
import { createGroup } from "../actions";
import { GroupInfoFields, ScheduleFields } from "../group-fields";

export function CreateGroupForm({
  defaultAnchorDate,
  minDate,
}: {
  defaultAnchorDate: string;
  minDate: string;
}) {
  const [state, formAction] = useActionState(createGroup, initialFormState);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card title="Quando">
        <div className="flex flex-col gap-4">
          <ScheduleFields anchorDate={defaultAnchorDate} minDate={minDate} />
        </div>
      </Card>
      <Card title="Dettagli">
        <div className="flex flex-col gap-4">
          <GroupInfoFields />
        </div>
      </Card>
      <FormMessage state={state} />
      <SubmitButton pendingLabel="Creazione…">Crea il gruppo</SubmitButton>
    </form>
  );
}
