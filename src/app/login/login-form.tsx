"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

export function LoginForm() {
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
        <p className="mt-2 font-medium">Controlla la tua email</p>
        <p className="mt-1 text-sm text-foreground/70">
          Abbiamo inviato un link di accesso a{" "}
          <span className="font-medium text-foreground">{state.email}</span>.
          Aprilo da questo dispositivo per entrare.
        </p>
        <p className="mt-3 text-xs text-foreground/50">
          Non lo trovi? Guarda nello spam o ricarica la pagina per riprovare.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        La tua email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        inputMode="email"
        placeholder="nome@esempio.it"
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
        {pending ? "Invio in corso…" : "Inviami il link di accesso"}
      </button>
      <p className="text-center text-xs text-foreground/50">
        Niente password: ti mandiamo un link via email per entrare.
      </p>
    </form>
  );
}
