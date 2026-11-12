import type { Metadata } from "next";
import { Suspense } from "react";
import { SubmitButton } from "@/components/form";
import { getI18n } from "@/i18n/server";
import { confirmEmailLink } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  const { m } = await getI18n();
  return { title: m.login.confirmTitle };
}

/**
 * Pagina del link nell'email: l'accesso si completa solo con un tocco, così
 * i controlli automatici dei programmi di posta non consumano il link.
 */
export default function ConfirmPage(props: PageProps<"/auth/accedi">) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 py-12 text-center">
      <Suspense>
        <Confirm {...props} />
      </Suspense>
    </main>
  );
}

async function Confirm({ searchParams }: PageProps<"/auth/accedi">) {
  const { token_hash, type, next } = await searchParams;
  const { m } = await getI18n();
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={72} height={72} className="mx-auto rounded-2xl" />
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{m.login.confirmTitle}</h1>
        <p className="mt-2 text-foreground/70">{m.login.confirmText}</p>
      </div>
      <form action={confirmEmailLink} className="flex flex-col">
        <input type="hidden" name="token_hash" value={typeof token_hash === "string" ? token_hash : ""} />
        <input type="hidden" name="type" value={typeof type === "string" ? type : "email"} />
        <input type="hidden" name="next" value={typeof next === "string" ? next : ""} />
        <SubmitButton pendingLabel={m.login.codeVerifying}>{m.login.confirmButton}</SubmitButton>
      </form>
    </>
  );
}
