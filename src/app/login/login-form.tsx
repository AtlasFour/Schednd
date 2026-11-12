"use client";

import { useActionState, useState } from "react";
import { useI18n } from "@/i18n/client";
import { sendMagicLink, verifyEmailCode, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

const inputClass =
  "h-12 rounded-xl border border-foreground/15 bg-background px-4 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30";
const primaryClass =
  "h-12 rounded-xl bg-brand font-medium text-white transition hover:bg-brand/90 disabled:opacity-60";

export function LoginForm() {
  const { m } = useI18n();
  const [sendState, sendAction, sending] = useActionState(sendMagicLink, initialState);
  // Dopo l'invio (o con "Hai già un codice?") si entra con il codice dell'email.
  const [manualCode, setManualCode] = useState(false);
  const [dismissed, setDismissed] = useState<LoginState | null>(null);

  if (sendState.status === "pending" && sendState !== dismissed) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-center">
          <p className="font-medium">{m.access.pendingTitle}</p>
          <p className="mt-1 text-sm text-foreground/70">{m.access.pendingText(sendState.email)}</p>
        </div>
        <button type="button" onClick={() => setDismissed(sendState)} className="text-sm text-brand underline">
          {m.login.otherEmail}
        </button>
      </div>
    );
  }

  const sentEmail = sendState.status === "sent" && sendState !== dismissed ? sendState.email : null;
  if (sentEmail || manualCode) {
    return (
      <CodeForm
        email={sentEmail}
        onRestart={() => {
          setManualCode(false);
          setDismissed(sendState);
        }}
      />
    );
  }

  return (
    <form action={sendAction} className="flex flex-col gap-3">
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
        className={inputClass}
      />
      {sendState.status === "error" && (
        <p role="alert" className="text-sm text-red-500">
          {sendState.message}
        </p>
      )}
      <button type="submit" disabled={sending} className={primaryClass}>
        {sending ? m.login.sending : m.login.send}
      </button>
      <p className="text-center text-xs text-foreground/50">{m.login.noPassword}</p>
      <button
        type="button"
        onClick={() => setManualCode(true)}
        className="text-sm text-brand underline"
      >
        {m.login.haveCode}
      </button>
    </form>
  );
}

function CodeForm({ email, onRestart }: { email: string | null; onRestart: () => void }) {
  const { m } = useI18n();
  const [state, action, pending] = useActionState<LoginState, FormData>(
    verifyEmailCode,
    email ? { status: "sent", email } : initialState,
  );
  const error = state.status === "sent" ? state.codeError : undefined;

  return (
    <div className="flex flex-col gap-4">
      {email && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 text-center">
          <p className="text-2xl" aria-hidden>
            📬
          </p>
          <p className="mt-2 font-medium">{m.login.checkEmail}</p>
          <p className="mt-1 text-sm text-foreground/70">{m.login.sentTo(email)}</p>
          <p className="mt-3 text-xs text-foreground/50">{m.login.notFound}</p>
        </div>
      )}
      <form action={action} className="flex flex-col gap-3">
        {email ? (
          <input type="hidden" name="email" value={email} />
        ) : (
          <>
            <label htmlFor="code-email" className="text-sm font-medium">
              {m.login.emailLabel}
            </label>
            <input
              id="code-email"
              name="email"
              // Dopo un tentativo il form si svuota: l'email resta.
              defaultValue={state.status === "sent" ? state.email : ""}
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              placeholder={m.login.emailPlaceholder}
              className={inputClass}
            />
          </>
        )}
        <label htmlFor="code" className="text-sm font-medium">
          {m.login.codeLabel}
        </label>
        <input
          id="code"
          name="code"
          required
          autoComplete="one-time-code"
          inputMode="numeric"
          pattern="[0-9 ]{6,12}"
          maxLength={12}
          placeholder={m.login.codePlaceholder}
          className={`${inputClass} text-center font-mono text-xl tracking-[0.4em]`}
        />
        {error && (
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? m.login.codeVerifying : m.login.codeVerify}
        </button>
      </form>
      <button type="button" onClick={onRestart} className="text-sm text-brand underline">
        {m.login.otherEmail}
      </button>
    </div>
  );
}
