/** Cookie che ricorda dove tornare dopo il login (es. un link d'invito). */
export const NEXT_PATH_COOKIE = "schednd_next";

/** Accetta solo percorsi interni, per evitare redirect verso altri siti. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return null;
}
