"use client";

import { useActionState, useRef, useState } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { useNavigateOnSuccess } from "@/components/navigation";
import { Card, cx, Field, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState } from "@/lib/form";
import type { GroupKind } from "@/lib/groups";
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
  const formRef = useRef<HTMLFormElement>(null);
  useNavigateOnSuccess(state, formRef);
  const [kind, setKind] = useState<GroupKind>("recurring");

  const kinds: { id: GroupKind; label: string; hint: string }[] = [
    { id: "recurring", label: m.events.kindRecurring, hint: m.events.kindRecurringHint },
    { id: "single", label: m.events.kindSingle, hint: m.events.kindSingleHint },
  ];

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{m.events.kindLabel}</legend>
        <div className="grid grid-cols-2 gap-2">
          {kinds.map((k) => (
            <label
              key={k.id}
              className={cx(
                "ui-btn flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3",
                kind === k.id ? "border-brand bg-brand/5" : "border-foreground/15",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={k.id}
                checked={kind === k.id}
                onChange={() => setKind(k.id)}
                className="sr-only"
              />
              <span className="font-medium">{k.label}</span>
              <span className="text-xs text-foreground/60">{k.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <Card title={m.groupForm.when}>
        <div className="flex flex-col gap-4">
          {kind === "recurring" ? (
            <ScheduleFields anchorDate={defaultAnchorDate} minDate={minDate} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label={m.events.eventDate} htmlFor="event_date">
                <Input
                  id="event_date"
                  name="event_date"
                  type="date"
                  required
                  min={minDate}
                  defaultValue={defaultAnchorDate}
                />
              </Field>
              <Field label={m.events.eventTime} htmlFor="event_time">
                <Input id="event_time" name="event_time" type="time" required defaultValue="21:00" />
              </Field>
            </div>
          )}
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
