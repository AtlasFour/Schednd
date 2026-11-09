"use client";

/**
 * Cronologia di navigazione dell'app (solo percorsi, in sessionStorage).
 *
 * Serve a far funzionare bene "indietro" (tasto, swipe, link "← …"):
 * quando un'azione o un link porta a una pagina già presente nella
 * cronologia, si torna indietro fino a lei invece di aggiungere una nuova
 * pagina. Così, ad esempio, dopo aver inviato una proposta "indietro" non
 * riporta al form già inviato.
 */

const KEY = "schednd-nav";
const EXPECT_KEY = "schednd-nav-expect";
const MAX = 50;
/** Oltre questo numero di passi si preferisce sostituire la pagina. */
const MAX_BACK_STEPS = 8;

type Router = { push: (href: string) => void; replace: (href: string) => void };

export function pathOf(href: string) {
  return href.split(/[?#]/)[0] || "/";
}

function read(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch {
    // sessionStorage non disponibile: la navigazione funziona lo stesso.
  }
}

function expect(path: string | null) {
  try {
    if (path) sessionStorage.setItem(EXPECT_KEY, path);
    else sessionStorage.removeItem(EXPECT_KEY);
  } catch {
    // ignorato
  }
}

/** Da chiamare a ogni cambio di pagina (vedi NavigationTracker). */
export function recordNavigation(pathname: string) {
  let stack = read();
  let expected: string | null = null;
  try {
    expected = sessionStorage.getItem(EXPECT_KEY);
  } catch {
    // ignorato
  }

  if (pathname === "/login") {
    write([]);
    expect(null);
    return;
  }

  if (expected === pathname) {
    // Navigazione fatta da smartNavigate: la pila è già aggiornata.
    expect(null);
    return;
  }

  const top = stack.at(-1);
  if (top === pathname) return;
  if (stack.at(-2) === pathname) {
    stack = stack.slice(0, -1); // "indietro" del browser
  } else {
    stack.push(pathname); // nuova pagina (o "avanti")
  }
  write(stack);
}

/** Quanti passi indietro servono per tornare a `path` (null se non c'è). */
function stepsBackTo(stack: string[], path: string): number | null {
  for (let i = stack.length - 2, steps = 1; i >= 0 && steps <= MAX_BACK_STEPS; i--, steps++) {
    if (stack[i] === path) return steps;
  }
  return null;
}

/**
 * Va a `href` come farebbe un'app: se la pagina è appena dietro nella
 * cronologia ci torna (history.go), altrimenti sostituisce la pagina attuale
 * (`mode: "replace"`, dopo un'azione) o ne apre una nuova (`mode: "push"`).
 */
export function smartNavigate(router: Router, href: string, mode: "replace" | "push" = "replace") {
  const path = pathOf(href);
  const stack = read();
  const steps = stepsBackTo(stack, path);

  if (steps !== null && href === path) {
    write(stack.slice(0, stack.length - steps));
    expect(path);
    window.history.go(-steps);
    return;
  }

  if (mode === "replace") {
    write([...stack.slice(0, -1), path]);
    expect(path);
    router.replace(href);
  } else {
    write([...stack, path]);
    expect(path);
    router.push(href);
  }
}

/** Vero se `href` è nella cronologia recente (si può tornare indietro). */
export function canGoBackTo(href: string) {
  return stepsBackTo(read(), pathOf(href)) !== null;
}
