"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/client";
import { minimumStatus, type Meeting } from "@/lib/meetings";
import { capitalize, formatShortDate, formatTime, relativeDay } from "@/lib/schedule";
import { AttendanceButtons } from "./attendance-buttons";
import { Badge, cx } from "./ui";

export function AttendanceSummary({ meeting }: { meeting: Meeting }) {
  const { m } = useI18n();
  const min = minimumStatus(meeting);
  const { counts } = meeting;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>
        <strong>{counts.yes}</strong>
        <span className="text-foreground/60">{m.meeting.present(meeting.memberCount)}</span>
      </span>
      {counts.maybe > 0 && <span className="text-foreground/60">{m.meeting.maybe(counts.maybe)}</span>}
      {counts.noAnswer > 0 && (
        <span className="text-foreground/60">{m.meeting.noAnswer(counts.noAnswer)}</span>
      )}
      {min &&
        (min.reached ? (
          <Badge tone="success">{m.meeting.weArePlaying}</Badge>
        ) : (
          <Badge>{m.meeting.missingPlayers(min.missing)}</Badge>
        ))}
    </div>
  );
}

export function MeetingCard({
  meeting,
  showGroup = true,
}: {
  meeting: Meeting;
  showGroup?: boolean;
}) {
  const { m, locale } = useI18n();
  const href = `/groups/${meeting.groupId}/${meeting.originalDate}`;
  return (
    <article
      className={cx(
        "ui-card flex flex-col gap-3 rounded-2xl border border-foreground/10 p-4",
        meeting.skipped && "opacity-70",
      )}
    >
      <Link href={href} className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">
            {capitalize(formatShortDate(meeting.date, locale))}
            {" · "}
            {formatTime(meeting.startTime)}
            <span className="font-normal text-foreground/50">
              {" "}
              · {relativeDay(meeting.date, meeting.today, locale)}
            </span>
          </p>
          {meeting.isExtra && !meeting.isSingle && (
            <Badge tone="brand">{m.events.extraBadge}</Badge>
          )}
          {meeting.date !== meeting.originalDate && (
            <p className="text-xs text-brand">
              {m.meeting.moved(formatShortDate(meeting.originalDate, locale))}
            </p>
          )}
          {showGroup && <p className="truncate text-sm">{meeting.groupName}</p>}
          {meeting.game && (
            <p className="truncate text-sm text-foreground/60">🎲 {meeting.game}</p>
          )}
        </div>
        <span className="shrink-0 text-foreground/40" aria-hidden>
          ›
        </span>
      </Link>

      {(meeting.proposalsToVote > 0 || meeting.proposalsTied > 0) && (
        <Link
          href={`${href}#proposte`}
          className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2 text-sm font-medium text-brand"
        >
          🗳️{" "}
          {meeting.proposalsToVote > 0 ? m.meeting.toVote(meeting.proposalsToVote) : m.meeting.tie}
          <span aria-hidden className="ml-auto">›</span>
        </Link>
      )}

      {meeting.skipped ? (
        <p className="text-sm font-medium text-foreground/70">{m.meeting.skipped}</p>
      ) : (
        <>
          <AttendanceSummary meeting={meeting} />
          <AttendanceButtons
            groupId={meeting.groupId}
            originalDate={meeting.originalDate}
            status={meeting.myStatus}
            compact
          />
        </>
      )}
    </article>
  );
}
