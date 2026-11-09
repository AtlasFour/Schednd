"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setAttendance } from "@/app/meetings/actions";
import { ATTENDANCE_LABELS, type AttendanceStatus } from "@/lib/meetings";
import { cx } from "./ui";

const ORDER: AttendanceStatus[] = ["yes", "maybe", "no"];

const ACTIVE: Record<AttendanceStatus, string> = {
  yes: "border-emerald-500 bg-emerald-500 text-white",
  maybe: "border-amber-500 bg-amber-500 text-white",
  no: "border-red-500 bg-red-500 text-white",
};

export function AttendanceButtons({
  groupId,
  originalDate,
  status,
  disabled,
  compact,
}: {
  groupId: string;
  originalDate: string;
  status: AttendanceStatus | null;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: AttendanceStatus) {
    // Un secondo tap sulla stessa scelta toglie la risposta.
    const value = optimistic === next ? null : next;
    setError(null);
    startTransition(async () => {
      setOptimistic(value);
      const result = await setAttendance(groupId, originalDate, value);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div
        role="group"
        aria-label="La tua presenza"
        className={cx("grid grid-cols-3 gap-2", pending && "opacity-80")}
      >
        {ORDER.map((s) => {
          const selected = optimistic === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => choose(s)}
              className={cx(
                "flex items-center justify-center gap-1 rounded-xl border font-medium transition disabled:opacity-50",
                compact ? "h-9 text-xs" : "h-11 text-sm",
                selected
                  ? ACTIVE[s]
                  : "border-foreground/15 hover:bg-foreground/5",
              )}
            >
              <span aria-hidden>{ATTENDANCE_LABELS[s].emoji}</span>
              {ATTENDANCE_LABELS[s].label}
            </button>
          );
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
