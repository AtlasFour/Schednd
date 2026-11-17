"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/form";
import type { GroupRow } from "@/lib/groups";
import { changeSchedule, setReminderHour, updateGroup } from "../../actions";
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

export function ReminderHourForm({ groupId, hour }: { groupId: string; hour: number }) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(setReminderHour.bind(null, groupId), initialFormState);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-foreground/70">{m.settings.remindersText}</p>
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          {m.settings.remindersHour}
          <Select name="reminder_hour" defaultValue={String(hour)} className="w-32">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </Select>
        </label>
        <SubmitButton small pendingLabel={m.common.saving}>
          {m.common.save}
        </SubmitButton>
      </div>
      <FormMessage state={state} />
      <p className="text-xs text-foreground/55">
        <a href="/profile/configurazione" className="underline">
          {m.settings.remindersNote}
        </a>
      </p>
    </form>
  );
}
