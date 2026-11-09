import type { Metadata } from "next";
import { Suspense } from "react";
import { getI18n } from "@/i18n/server";
import { LoginForm } from "./login-form";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.login.title };
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense>
      <Login searchParams={searchParams} />
    </Suspense>
  );
}

async function Login({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const { m } = await getI18n();
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
        <p className="mt-2 text-foreground/70">{m.login.tagline}</p>
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
  const { m } = await getI18n();
  const errors: Record<string, string> = {
    link_non_valido: m.login.errorInvalidLink,
    altro_browser: m.login.errorOtherBrowser,
  };
  const message = typeof errore === "string" ? errors[errore] : undefined;

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
