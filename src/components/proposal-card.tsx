"use client";

import { useState, useTransition } from "react";
import { cancelProposal, castVote, decideProposal } from "@/app/proposals/actions";
import {
  formatDeadline,
  isOpen,
  optionLabel,
  type ProposalRow,
} from "@/lib/proposals";
import { useI18n } from "@/i18n/client";
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
  const { m, locale } = useI18n();
  const myBallot = proposal.ballots.find((b) => b.user_id === userId);
  const [selected, setSelected] = useState<string[]>(myBallot?.option_ids ?? []);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const open = isOpen(proposal.status);
  const type = m.labels.proposalType[proposal.type];
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
            {m.proposal.by(
              proposal.created_by ? (names[proposal.created_by] ?? m.common.formerMember) : m.common.formerMember,
            )}
            {open && m.proposal.votingUntil(formatDeadline(proposal.closes_at, timeZone, locale))}
          </p>
        </div>
        <Badge
          tone={
            proposal.status === "approved" ? "success" : open ? "brand" : "neutral"
          }
        >
          {m.labels.proposalStatus[proposal.status]}
        </Badge>
      </header>

      {proposal.reason && (
        <p className="whitespace-pre-line text-sm text-foreground/80">“{proposal.reason}”</p>
      )}

      <ul className="flex flex-col gap-2">
        {proposal.proposal_options.map((option) => {
          const voters = proposal.ballots
            .filter((b) => b.option_ids.includes(option.id))
            .map((b) => names[b.user_id] ?? m.common.formerMember);
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
                      {optionLabel(proposal.type, option, m, locale)}
                    </span>
                  </label>
                ) : (
                  <span className="truncate font-medium">
                    {winner && "✓ "}
                    {optionLabel(proposal.type, option, m, locale)}
                  </span>
                )}
                <span className="shrink-0 text-sm text-foreground/60">
                  {m.proposal.votes(voters.length)}
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
                    if (window.confirm(m.proposal.confirmChoice(optionLabel(proposal.type, option, m, locale)))) {
                      run(() => decideProposal(proposal.id, option.id));
                    }
                  }}
                >
                  {isSkip ? m.proposal.approveSkip : m.proposal.chooseThis}
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
            {m.proposal.yesSkip}
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
            {m.proposal.noPlay}
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
              ? m.proposal.sending
              : selected.length === 0
                ? m.proposal.noneFine
                : myBallot
                  ? m.proposal.updateVote
                  : m.proposal.vote}
          </button>
          <span className="text-xs text-foreground/55">
            {myBallot ? m.proposal.alreadyVoted : m.proposal.tickAll}
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
                if (window.confirm(m.proposal.confirmReject)) {
                  run(() => decideProposal(proposal.id, null));
                }
              }}
            >
              {m.proposal.reject}
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={pending}
              className={buttonClass("ghost", true)}
              onClick={() => {
                if (window.confirm(m.proposal.confirmCancel)) {
                  run(() => cancelProposal(proposal.id));
                }
              }}
            >
              {m.proposal.cancel}
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
