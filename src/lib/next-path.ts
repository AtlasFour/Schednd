/** Cookie che ricorda dove tornare dopo il login (es. un link d'invito). */
export const NEXT_PATH_COOKIE = "schednd_next";

/** Accetta solo percorsi interni, per evitare redirect verso altri siti. */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/")) return null;
  // Niente "//", "\\" né caratteri di controllo (es. "/\t/sito.com" che il
  // browser legge come "//sito.com"): solo indirizzi di questo sito.
  if (/[\\\u0000-\u001f\u007f]/.test(next) || next.startsWith("//")) return null;
  try {
    const url = new URL(next, "http://schednd.invalid");
    if (url.origin !== "http://schednd.invalid") return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}
