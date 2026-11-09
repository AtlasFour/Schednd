import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Accedi" };

const ERROR_MESSAGES: Record<string, string> = {
  link_non_valido:
    "Il link di accesso non è valido o è scaduto. Richiedine uno nuovo.",
  altro_browser:
    "Non è stato possibile completare l'accesso. Apri il link nello stesso browser in cui l'hai richiesto (es. Chrome), oppure richiedine uno nuovo da qui.",
};

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-6 py-12">
      <div className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icons/icon-192.png"
          alt=""
          width={72}
          height={72}
          className="mx-auto rounded-2xl"
        />
        <h1 className="mt-4 text-3xl font-bold tracking-tight">Schednd</h1>
        <p className="mt-2 text-foreground/70">
          Le tue sessioni di gioco, organizzate.
        </p>
      </div>

      <Suspense>
        <ErrorBanner searchParams={searchParams} />
      </Suspense>

      <LoginForm />
    </main>
  );
}

async function ErrorBanner({
  searchParams,
}: Pick<PageProps<"/login">, "searchParams">) {
  const { errore } = await searchParams;
  const message =
    typeof errore === "string" ? ERROR_MESSAGES[errore] : undefined;

  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500"
    >
      {message}
    </p>
  );
}
