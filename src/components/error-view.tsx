"use client";

import Link from "next/link";
import type { Messages } from "@/i18n/messages";
import { buttonClass } from "./ui";

/** Schermata d'errore con "Riprova" (usata dalle pagine d'errore). */
export function ErrorView({ m, retry }: { m: Messages; retry: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-6 py-12 text-center">
      <p className="text-4xl" aria-hidden>
        🎲
      </p>
      <h1 className="text-xl font-bold">{m.login.errorTitle}</h1>
      <p className="text-sm text-foreground/70">{m.login.errorText}</p>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          {m.login.errorRetry}
        </button>
        <Link href="/" className={buttonClass("secondary")}>
          {m.login.errorHome}
        </Link>
      </div>
    </main>
  );
}
