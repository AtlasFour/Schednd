"use client";

import { useActionState, useState, useTransition } from "react";
import { FormMessage, SubmitButton } from "@/components/form";
import { buttonClass, inputClass } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { initialFormState, type FormState } from "@/lib/form";
import { addApprovedEmail, deleteAccess, setAccess } from "./actions";

export type AccessRow = {
  email: string;
  status: "pending" | "approved" | "blocked";
  attempts: number;
  last_seen: string;
};

export function AccessList({ rows }: { rows: AccessRow[] }) {
  const { m } = useI18n();
  if (rows.length === 0) return <p className="text-sm text-foreground/60">{m.access.none}</p>;
  return (
    <ul className="flex flex-col divide-y divide-foreground/10">
      {rows.map((r) => (
        <AccessItem key={r.email} row={r} />
      ))}
    </ul>
  );
}

function AccessItem({ row }: { row: AccessRow }) {
  const { locale, m } = useI18n();
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<FormState>({});
  const run = (action: () => Promise<FormState>) => startTransition(async () => setState(await action()));
  const when = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "it-IT", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(row.last_seen));

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{row.email}</p>
        {row.attempts > 0 && (
          <p className="text-xs text-foreground/55">
            {m.access.attempts(row.attempts)} · {m.access.lastSeen(when)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {row.status !== "approved" && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("primary", true)}
            onClick={() => run(() => setAccess(row.email, "approved"))}
          >
            {row.status === "blocked" ? m.access.unblock : m.access.approve}
          </button>
        )}
        {row.status !== "blocked" && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("secondary", true)}
            onClick={() => {
              if (window.confirm(m.access.confirmBlock)) run(() => setAccess(row.email, "blocked"));
            }}
          >
            {m.access.block}
          </button>
        )}
        {row.status !== "approved" && (
          <button
            type="button"
            disabled={pending}
            className={buttonClass("ghost", true)}
            onClick={() => run(() => deleteAccess(row.email))}
          >
            {m.access.remove}
          </button>
        )}
      </div>
      <FormMessage state={state} />
    </li>
  );
}

export function AddEmailForm() {
  const { m } = useI18n();
  const [state, action] = useActionState(addApprovedEmail, initialFormState);
  return (
    <form action={action} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder={m.login.emailPlaceholder}
          aria-label={m.access.addLabel}
          className={`${inputClass} h-10 text-sm`}
        />
        <SubmitButton small>{m.access.addButton}</SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
