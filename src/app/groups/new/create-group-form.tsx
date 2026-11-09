"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { useNavigateOnSuccess } from "@/components/navigation";
import { Card } from "@/components/ui";
import { useI18n } from "@/i18n/client";
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
  const { m } = useI18n();
  const [state, formAction] = useActionState(createGroup, initialFormState);
  useNavigateOnSuccess(state);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Card title={m.groupForm.when}>
        <div className="flex flex-col gap-4">
          <ScheduleFields anchorDate={defaultAnchorDate} minDate={minDate} />
        </div>
      </Card>
      <Card title={m.groupForm.details}>
        <div className="flex flex-col gap-4">
          <GroupInfoFields />
        </div>
      </Card>
      <FormMessage state={state} />
      <SubmitButton pendingLabel={m.groupForm.creating}>{m.groupForm.create}</SubmitButton>
    </form>
  );
}
