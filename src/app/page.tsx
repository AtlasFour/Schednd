import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default function HomePage() {
  if (!getSupabaseEnv()) {
    return <MissingConfig />;
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-5 py-8">
      <Suspense fallback={<UserHeaderSkeleton />}>
        <UserHeader />
      </Suspense>

      <section className="rounded-2xl border border-foreground/10 p-5">
        <h2 className="font-semibold">Prossimi incontri</h2>
        <p className="mt-2 text-sm text-foreground/70">
          Qui vedrai tutti gli incontri dei tuoi gruppi, con le presenze e il
          gioco in programma.
        </p>
        <p className="mt-4 rounded-xl bg-brand/10 p-3 text-sm text-brand">
          🚧 In costruzione: gruppi e incontri arrivano nelle prossime fasi.
        </p>
      </section>
    </main>
  );
}

async function UserHeader() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const email = typeof claims.email === "string" ? claims.email : "";

  return (
    <header className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm text-foreground/60">Ciao 👋</p>
        <h1 className="text-xl font-semibold break-all">{email}</h1>
      </div>
      <form action={signOut}>
        <button
          type="submit"
          className="rounded-lg border border-foreground/15 px-3 py-2 text-sm hover:bg-foreground/5"
        >
          Esci
        </button>
      </form>
    </header>
  );
}

function UserHeaderSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4" aria-hidden>
      <div className="flex flex-col gap-2">
        <div className="h-4 w-12 animate-pulse rounded bg-foreground/10" />
        <div className="h-6 w-48 animate-pulse rounded bg-foreground/10" />
      </div>
      <div className="h-9 w-14 animate-pulse rounded-lg bg-foreground/10" />
    </div>
  );
}

function MissingConfig() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 px-6 py-12">
      <h1 className="text-xl font-semibold">Configurazione mancante</h1>
      <p className="text-sm text-foreground/70">
        Le variabili <code>NEXT_PUBLIC_SUPABASE_URL</code> e{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> non sono impostate. Aggiungile
        su Vercel (Settings → Environment Variables) e ripubblica il sito.
      </p>
    </main>
  );
}
