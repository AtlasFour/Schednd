"use client";

import { useActionState } from "react";
import { useI18n } from "@/i18n/client";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
  const { m } = useI18n();
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
        <p className="text-2xl" aria-hidden>
          📬
        </p>
        <p className="mt-2 font-medium">{m.login.checkEmail}</p>
        <p className="mt-1 text-sm text-foreground/70">{m.login.sentTo(state.email)}</p>
        <p className="mt-3 text-xs text-foreground/50">{m.login.notFound}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        {m.login.emailLabel}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder={m.login.emailPlaceholder}
        className="h-12 rounded-xl border border-foreground/15 bg-background px-4 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
      />
      {state.status === "error" && (
        <p role="alert" className="text-sm text-red-500">
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-brand font-medium text-white transition hover:bg-brand/90 disabled:opacity-60"
      >
        {pending ? m.login.sending : m.login.send}
      </button>
      <p className="text-center text-xs text-foreground/50">
        {m.login.noPassword}
      </p>
    </form>
  );
}
