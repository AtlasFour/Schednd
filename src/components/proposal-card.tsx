"use client";

import { useState, useTransition } from "react";
import { cancelProposal, castVote, decideProposal } from "@/app/proposals/actions";
import {
  formatDeadline,
  isOpen,
  optionLabel,
  PROPOSAL_STATUS_LABELS,
  PROPOSAL_TYPE_LABELS,
  type ProposalRow,
} from "@/lib/proposals";
import { Badge, buttonClass, cx } from "./ui";

export function ProposalCard({
  proposal,
  userId,
  isOwner,
  ownerDecidesRule,
  names,
  timeZone,
}: {
  proposal: ProposalRow;
  userId: string;
  isOwner: boolean;
  ownerDecidesRule: boolean;
  names: Record<string, string>;
  timeZone: string;
}) {
  const myBallot = proposal.ballots.find((b) => b.user_id === userId);
  const [selected, setSelected] = useState<string[]>(myBallot?.option_ids ?? []);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = isOpen(proposal.status);
  const type = PROPOSAL_TYPE_LABELS[proposal.type];
  const canCancel = open && (isOwner || proposal.created_by === userId);
  const ownerMustDecide =
    isOwner && open && (proposal.status === "needs_owner" || ownerDecidesRule);
  const isSkip = proposal.type === "skip";

  function run(action: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) setError(result.error);
    });
  }

  function toggle(optionId: string) {
    setSelected((prev) =>
      prev.includes(optionId) ? prev.filter((id) => id !== optionId) : [...prev, optionId],
    );
  }

  const ballotChanged =
    !myBallot ||
    myBallot.option_ids.length !== selected.length ||
    myBallot.option_ids.some((id) => !selected.includes(id));

  return (
    <article
      className={cx(
        "ui-card flex flex-col gap-3 rounded-2xl border p-4",
        open ? "border-brand/40 bg-brand/5" : "border-foreground/10",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            <span aria-hidden>{type.emoji}</span> {type.label}
          </p>
          <p className="text-xs text-foreground/60">
            da {proposal.created_by ? (names[proposal.created_by] ?? "ex membro") : "ex membro"}
            {open && ` · si vota fino a ${formatDeadline(proposal.closes_at, timeZone)}`}
          </p>
        </div>
        <Badge
          tone={
            proposal.status === "approved" ? "success" : open ? "brand" : "neutral"
          }
        >
          {PROPOSAL_STATUS_LABELS[proposal.status]}
        </Badge>
      </header>

      {proposal.reason && (
        <p className="whitespace-pre-line text-sm text-foreground/80">“{proposal.reason}”</p>
      )}

      <ul className="flex flex-col gap-2">
        {proposal.proposal_options.map((option) => {
          const voters = proposal.ballots
            .filter((b) => b.option_ids.includes(option.id))
            .map((b) => names[b.user_id] ?? "ex membro");
          const winner = proposal.winning_option_id === option.id;
          return (
            <li
              key={option.id}
              className={cx(
                "flex flex-col gap-1 rounded-xl border px-3 py-2",
                winner ? "border-emerald-500/60 bg-emerald-500/10" : "border-foreground/10",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                {open && !isSkip ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-5 accent-[var(--brand)]"
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(option.id)}
                      disabled={pending}
                    />
                    <span className="truncate font-medium">
                      {optionLabel(proposal.type, option)}
                    </span>
                  </label>
                ) : (
                  <span className="truncate font-medium">
                    {winner && "✓ "}
                    {optionLabel(proposal.type, option)}
                  </span>
                )}
                <span className="shrink-0 text-sm text-foreground/60">
                  {voters.length} {voters.length === 1 ? "voto" : "voti"}
                </span>
              </div>
              {voters.length > 0 && (
                <p className="text-xs text-foreground/55">{voters.join(", ")}</p>
              )}
              {ownerMustDecide && (
                <button
                  type="button"
                  disabled={pending}
                  className={cx(buttonClass("secondary", true), "self-start")}
                  onClick={() => {
                    if (window.confirm(`Confermi la scelta: ${optionLabel(proposal.type, option)}?`)) {
                      run(() => decideProposal(proposal.id, option.id));
                    }
                  }}
                >
                  {isSkip ? "Approva il salto" : "Scegli questa"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {open && isSkip && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={pending}
            aria-pressed={myBallot?.option_ids.length === 1}
            onClick={() => run(() => castVote(proposal.id, proposal.proposal_options.map((o) => o.id)))}
            className={cx(
              buttonClass(myBallot?.option_ids.length === 1 ? "primary" : "secondary", true),
            )}
          >
            👍 Sì, saltiamo
          </button>
          <button
            type="button"
            disabled={pending}
            aria-pressed={myBallot !== undefined && myBallot.option_ids.length === 0}
            onClick={() => run(() => castVote(proposal.id, []))}
            className={cx(
              buttonClass(
                myBallot !== undefined && myBallot.option_ids.length === 0 ? "primary" : "secondary",
                true,
              ),
            )}
          >
            👎 No, giochiamo
          </button>
        </div>
      )}

      {open && !isSkip && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending || !ballotChanged}
            onClick={() => run(() => castVote(proposal.id, selected))}
            className={buttonClass("primary", true)}
          >
            {pending
              ? "Invio…"
              : selected.length === 0
                ? "Nessuna mi va bene"
                : myBallot
                  ? "Aggiorna il voto"
                  : "Vota"}
          </button>
          <span className="text-xs text-foreground/55">
            {myBallot ? "Hai già votato: puoi cambiare idea." : "Spunta tutte le opzioni che ti vanno bene."}
          </span>
        </div>
      )}

      {(ownerMustDecide || canCancel) && (
        <div className="flex flex-wrap gap-2 border-t border-foreground/10 pt-3">
          {ownerMustDecide && (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("ghost", true)}
              onClick={() => {
                if (window.confirm("Respingere la proposta?")) {
                  run(() => decideProposal(proposal.id, null));
                }
              }}
            >
              Respingi
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("ghost", true)}
              onClick={() => {
                if (window.confirm("Annullare la proposta?")) {
                  run(() => cancelProposal(proposal.id));
                }
              }}
            >
              Annulla proposta
            </button>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </article>
  );
}
