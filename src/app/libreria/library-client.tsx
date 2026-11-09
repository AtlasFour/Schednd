"use client";

import { useActionState, useOptimistic, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { buttonClass, cx, Field, Input, Select } from "@/components/ui";
import { initialFormState, type FormState } from "@/lib/form";
import { GAME_KIND_LABELS, type GameKind } from "@/lib/library";
import { addManualGame, importFromBgg, toggleFavorite } from "./actions";

export function FavoriteButton({ gameId, favorite }: { gameId: string; favorite: boolean }) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? "Togli dai preferiti" : "Aggiungi ai preferiti"}
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
      {optimistic ? "★ Preferito" : "☆ Preferito"}
    </button>
  );
}

export function AddGameForm() {
  const [state, formAction] = useActionState(addManualGame, initialFormState);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${buttonClass("secondary", true)} self-start`}>
        + Aggiungi un gioco a mano
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Nome del gioco" htmlFor="title">
        <Input id="title" name="title" required maxLength={120} placeholder="es. D&D 5e" />
      </Field>
      <Field label="Tipo" htmlFor="kind">
        <Select id="kind" name="kind" defaultValue="board">
          {(Object.keys(GAME_KIND_LABELS) as GameKind[]).map((k) => (
            <option key={k} value={k}>
              {GAME_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Min. giocatori" htmlFor="min_players">
          <Input id="min_players" name="min_players" type="number" inputMode="numeric" min={1} max={99} />
        </Field>
        <Field label="Max giocatori" htmlFor="max_players">
          <Input id="max_players" name="max_players" type="number" inputMode="numeric" min={1} max={99} />
        </Field>
        <Field label="Minuti" htmlFor="playing_minutes">
          <Input id="playing_minutes" name="playing_minutes" type="number" inputMode="numeric" min={1} max={9999} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div className="flex gap-2">
        <SubmitButton small pendingLabel="Aggiunta…">
          Aggiungi
        </SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonClass("ghost", true)}>
          Chiudi
        </button>
      </div>
    </form>
  );
}

export function BggImportButton() {
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
        {pending ? "Importazione… (può richiedere qualche secondo)" : "⬇️ Importa / aggiorna da BoardGameGeek"}
      </button>
      <FormMessage state={state} />
    </div>
  );
}
