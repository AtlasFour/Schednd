"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { buttonClass, cx, Field, Input, Select } from "@/components/ui";
import { initialFormState, type FormState } from "@/lib/form";
import { useI18n } from "@/i18n/client";
import { GAME_KINDS } from "@/lib/library";
import { addManualGame, importFromBgg, toggleFavorite } from "./actions";

export function FavoriteButton({ gameId, favorite }: { gameId: string; favorite: boolean }) {
  const { m } = useI18n();
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? m.library.unfavorite : m.library.favorite}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await toggleFavorite(gameId, !optimistic);
        })
      }
      className={cx(
        "rounded-lg px-2 py-1 text-sm transition",
        optimistic ? "text-amber-500" : "text-foreground/30 hover:text-amber-500",
      )}
    >
      {optimistic ? m.library.isFavorite : m.library.notFavorite}
    </button>
  );
}

export function AddGameForm() {
  const { m } = useI18n();
  const [state, formAction] = useActionState(addManualGame, initialFormState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("secondary", true)} self-start`}>
        {m.library.addManually}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label={m.library.gameName} htmlFor="title">
        <Input id="title" name="title" required maxLength={120} placeholder={m.library.gameNamePlaceholder} />
      </Field>
      <Field label={m.library.type} htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="board">
          {GAME_KINDS.map((k) => (
            <option key={k} value={k}>
              {m.labels.gameKind[k]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={m.library.minPlayers} htmlFor="min_players">
          <Input id="min_players" name="min_players" type="number" inputMode="numeric" min={1} max={99} />
        </Field>
        <Field label={m.library.maxPlayers} htmlFor="max_players">
          <Input id="max_players" name="max_players" type="number" inputMode="numeric" min={1} max={99} />
        </Field>
        <Field label={m.library.minutes} htmlFor="playing_minutes">
          <Input id="playing_minutes" name="playing_minutes" type="number" inputMode="numeric" min={1} max={9999} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton small pendingLabel={m.library.adding}>
          {m.library.add}
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", true)}>
          {m.common.close}
        </button>
      </div>
    </form>
  );
}

export function BggImportButton() {
  const { m } = useI18n();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setState({});
            setState(await importFromBgg());
          })
        }
        className={`${buttonClass("primary", true)} self-start`}
      >
        {pending ? m.library.importing : m.library.import}
      </button>
      <FormMessage state={state} />
    </div>
  );
}
