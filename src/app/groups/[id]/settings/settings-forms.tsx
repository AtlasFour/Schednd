"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/form";
import type { GroupRow } from "@/lib/groups";
import { changeSchedule, updateGroup } from "../../actions";
import { GroupInfoFields, ScheduleFields } from "../../group-fields";

export function GroupInfoForm({ group }: { group: GroupRow }) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(
    updateGroup.bind(null, group.id),
    initialFormState,
  );
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <GroupInfoFields group={group} />
      <FormMessage state={state} />
      <SubmitButton pendingLabel={m.common.saving}>{m.common.save}</SubmitButton>
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
  const { m } = useI18n();
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
        dateLabel={m.settings.newScheduleFirst}
      />
      <FormMessage state={state} />
      <SubmitButton
        pendingLabel={m.common.saving}
        confirm={m.settings.confirmSchedule}
      >
        {m.settings.changeSchedule}
      </SubmitButton>
    </form>
  );
}
