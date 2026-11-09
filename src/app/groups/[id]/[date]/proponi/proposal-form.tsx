"use client";

import { useActionState, useState } from "react";
import { createProposal } from "@/app/proposals/actions";
import { FormMessage, SubmitButton } from "@/components/form";
import { buttonClass, Card, cx, Field, Input, Textarea } from "@/components/ui";
import { initialFormState } from "@/lib/form";
import { PROPOSAL_TYPE_LABELS, type ProposalType } from "@/lib/proposals";

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
  const [state, formAction] = useActionState(
    createProposal.bind(null, groupId, originalDate),
    initialFormState,
  );
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
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Cosa vuoi proporre?</legend>
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
                  {PROPOSAL_TYPE_LABELS[t].emoji} {PROPOSAL_TYPE_LABELS[t].label}
                </span>
                <span className="block text-xs text-foreground/60">
                  {disabled
                    ? "C'è già una proposta di questo tipo in corso."
                    : PROPOSAL_TYPE_LABELS[t].hint}
                </span>
              </span>
            </label>
          );
        })}
      </fieldset>

      {type !== "skip" && (
        <Card title={type === "reschedule" ? "Date proposte" : "Giochi proposti"}>
          <div className="flex flex-col gap-3">
            {rows.map((key, i) => (
              <div key={`${type}-${key}`} className="flex items-end gap-2">
                {type === "reschedule" ? (
                  <>
                    <div className="flex-1">
                      <Field label={`Data ${i + 1}`} htmlFor={`date-${key}`}>
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
                      <Field label="Orario" htmlFor={`time-${key}`}>
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
                    <Field label={`Gioco ${i + 1}`} htmlFor={`game-${key}`}>
                      <Input
                        id={`game-${key}`}
                        name="option_game"
                        required
                        maxLength={120}
                        list="game-suggestions"
                        placeholder="es. Catan"
                      />
                    </Field>
                  </div>
                )}
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(key)}
                    aria-label="Togli questa opzione"
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
                + Aggiungi {type === "reschedule" ? "un'altra data" : "un altro gioco"}
              </button>
            )}
            <p className="text-xs text-foreground/55">
              Gli altri potranno spuntare tutte le opzioni che vanno loro bene.
            </p>
          </div>
          <datalist id="game-suggestions">
            {gameSuggestions.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Card>
      )}

      <Field label="Messaggio" htmlFor="reason" hint="Facoltativo: spiega il motivo agli altri.">
        <Textarea
          id="reason"
          name="reason"
          maxLength={500}
          placeholder={
            type === "skip" ? "es. Siamo in pochi, recuperiamo la prossima" : "es. Mercoledì lavoro fino a tardi"
          }
        />
      </Field>

      <FormMessage state={state} />
      <SubmitButton pendingLabel="Invio…">Invia la proposta</SubmitButton>
    </form>
  );
}
