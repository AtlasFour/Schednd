"use client";

import { useActionState, useRef, useState } from "react";
import { createProposal } from "@/app/proposals/actions";
import { FormMessage, SubmitButton } from "@/components/form";
import { useNavigateOnSuccess } from "@/components/navigation";
import { buttonClass, Card, cx, Field, Input, Textarea } from "@/components/ui";
import { initialFormState } from "@/lib/form";
import { useI18n } from "@/i18n/client";
import type { ProposalType } from "@/lib/proposals";

const MAX_OPTIONS = 6;
const TYPES: ProposalType[] = ["reschedule", "change_game", "skip"];

export function ProposalForm({
  groupId,
  originalDate,
  defaultTime,
  minDate,
  disabledTypes,
  gameSuggestions,
}: {
  groupId: string;
  originalDate: string;
  defaultTime: string;
  minDate: string;
  disabledTypes: ProposalType[];
  gameSuggestions: string[];
}) {
  const { m } = useI18n();
  const [state, formAction] = useActionState(
    createProposal.bind(null, groupId, originalDate),
    initialFormState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  useNavigateOnSuccess(state, formRef);
  const firstAvailable = TYPES.find((t) => !disabledTypes.includes(t)) ?? "reschedule";
  const [type, setType] = useState<ProposalType>(firstAvailable);
  const [rows, setRows] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  function addRow() {
    if (rows.length >= MAX_OPTIONS) return;
    setRows((r) => [...r, nextKey]);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((r) => (r.length > 1 ? r.filter((k) => k !== key) : r));
  }

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{m.propose.whatToPropose}</legend>
        {TYPES.map((t) => {
          const disabled = disabledTypes.includes(t);
          return (
            <label
              key={t}
              className={cx(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3",
                type === t ? "border-brand bg-brand/5" : "border-foreground/15",
                disabled && "cursor-not-allowed opacity-50",
              )}
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                disabled={disabled}
                onChange={() => {
                  setType(t);
                  setRows([0]);
                }}
                className="mt-1 accent-[var(--brand)]"
              />
              <span>
                <span className="font-medium">
                  {m.labels.proposalType[t].emoji} {m.labels.proposalType[t].label}
                </span>
                <span className="block text-xs text-foreground/60">
                  {disabled
                    ? m.propose.alreadyOpen
                    : m.labels.proposalType[t].hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {type !== "skip" && (
        <Card title={type === "reschedule" ? m.propose.datesTitle : m.propose.gamesTitle}>
          <div className="flex flex-col gap-3">
            {rows.map((key, i) => (
              <div key={`${type}-${key}`} className="flex items-end gap-2">
                {type === "reschedule" ? (
                  <>
                    <div className="flex-1">
                      <Field label={m.propose.dateN(i + 1)} htmlFor={`date-${key}`}>
                        <Input
                          id={`date-${key}`}
                          name="option_date"
                          type="date"
                          required
                          min={minDate}
                        />
                      </Field>
                    </div>
                    <div className="w-28">
                      <Field label={m.propose.time} htmlFor={`time-${key}`}>
                        <Input
                          id={`time-${key}`}
                          name="option_time"
                          type="time"
                          required
                          defaultValue={defaultTime}
                        />
                      </Field>
                    </div>
                  </>
                ) : (
                  <div className="flex-1">
                    <Field label={m.propose.gameN(i + 1)} htmlFor={`game-${key}`}>
                      <Input
                        id={`game-${key}`}
                        name="option_game"
                        required
                        maxLength={120}
                        list="game-suggestions"
                        placeholder={m.propose.gamePlaceholder}
                      />
                    </Field>
                  </div>
                )}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(key)}
                    aria-label={m.propose.removeOption}
                    className={cx(buttonClass("ghost"), "w-11 shrink-0 px-0")}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {rows.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addRow}
                className={cx(buttonClass("secondary", true), "self-start")}
              >
                {type === "reschedule" ? m.propose.addDate : m.propose.addGame}
              </button>
            )}
            <p className="text-xs text-foreground/55">
              {m.propose.othersTick}
            </p>
          </div>
          <datalist id="game-suggestions">
            {gameSuggestions.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Card>
      )}

      <Field label={m.propose.message} htmlFor="reason" hint={m.propose.messageHint}>
        <Textarea
          id="reason"
          name="reason"
          maxLength={500}
          placeholder={
            type === "skip" ? m.propose.messagePlaceholderSkip : m.propose.messagePlaceholder
          }
        />
      </Field>

      <FormMessage state={state} />
      <SubmitButton pendingLabel={m.propose.sending}>{m.propose.send}</SubmitButton>
    </form>
  );
}
