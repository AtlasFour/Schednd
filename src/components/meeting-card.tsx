import Link from "next/link";
import { minimumStatus, type Meeting } from "@/lib/meetings";
import { capitalize, formatShortDate, formatTime, relativeDay } from "@/lib/schedule";
import { AttendanceButtons } from "./attendance-buttons";
import { Badge, cx } from "./ui";

export function AttendanceSummary({ meeting }: { meeting: Meeting }) {
  const min = minimumStatus(meeting);
  const { counts } = meeting;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span>
        <strong>{counts.yes}</strong>
        <span className="text-foreground/60">/{meeting.memberCount} presenti</span>
      </span>
      {counts.maybe > 0 && <span className="text-foreground/60">{counts.maybe} forse</span>}
      {counts.noAnswer > 0 && (
        <span className="text-foreground/60">{counts.noAnswer} senza risposta</span>
      )}
      {min &&
        (min.reached ? (
          <Badge tone="success">Si gioca! 🎲</Badge>
        ) : (
          <Badge>
            {min.missing === 1 ? "Manca 1 giocatore" : `Mancano ${min.missing} giocatori`}
          </Badge>
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
            {capitalize(formatShortDate(meeting.date))}
            {" · "}
            {formatTime(meeting.startTime)}
            <span className="font-normal text-foreground/50">
              {" "}
              · {relativeDay(meeting.date, meeting.today)}
            </span>
          </p>
          {meeting.date !== meeting.originalDate && (
            <p className="text-xs text-brand">
              📅 Spostato (era {formatShortDate(meeting.originalDate)})
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
          {meeting.proposalsToVote > 0
            ? meeting.proposalsToVote === 1
              ? "1 proposta da votare"
              : `${meeting.proposalsToVote} proposte da votare`
            : "Proposta in pareggio: decide l'owner"}
          <span aria-hidden className="ml-auto">›</span>
        </Link>
      )}

      {meeting.skipped ? (
        <p className="text-sm font-medium text-foreground/70">⏭️ Incontro saltato</p>
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
