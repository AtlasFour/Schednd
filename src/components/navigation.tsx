"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { recordNavigation, smartNavigate } from "@/lib/navigation";
import type { NavResult } from "@/lib/form";

/** Registra ogni cambio di pagina nella cronologia dell'app. */
export function NavigationTracker() {
  const pathname = usePathname();
  useEffect(() => {
    recordNavigation(pathname);
  }, [pathname]);
  return null;
}

/**
 * Link "← …" in cima alle pagine: se la pagina indicata è quella da cui si
 * arriva torna indietro nella cronologia, altrimenti la apre.
 */
export function BackLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
        event.preventDefault();
        smartNavigate(router, href, "push");
      }}
    >
      {children}
    </Link>
  );
}

export type { NavResult };

/**
 * Form per le azioni che, una volta completate, portano a un'altra pagina
 * (uscire dal gruppo, entrare con un invito…). La navigazione evita di
 * lasciare nella cronologia pagine che non hanno più senso.
 */
export function NavForm({
  action,
  className,
  children,
}: {
  action: () => Promise<NavResult>;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className={className}
      action={async () => {
        setError(null);
        const result = await action();
        if (result.error) setError(result.error);
        else if (result.redirectTo) smartNavigate(router, result.redirectTo);
      }}
    >
      {children}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-500">
          {error}
        </p>
      )}
    </form>
  );
}

/** Dopo un'azione riuscita con `redirectTo`, naviga in modo "intelligente". */
export function useNavigateOnSuccess(state: NavResult) {
  const router = useRouter();
  useEffect(() => {
    if (state.redirectTo && !state.error) smartNavigate(router, state.redirectTo);
  }, [state, router]);
}
