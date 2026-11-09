import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

/** Pagine visibili anche senza aver fatto login. */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

/**
 * Rinnova la sessione Supabase a ogni richiesta e manda al login
 * chi non è autenticato.
 */
export async function updateSession(request: NextRequest) {
  // Se Supabase rimanda il link di accesso a una pagina diversa da
  // /auth/confirm (es. la home, quando l'indirizzo non è tra i Redirect URLs),
  // inoltriamo il codice alla pagina giusta.
  const { pathname: currentPath, searchParams } = request.nextUrl;
  if (
    (searchParams.has("code") || searchParams.has("token_hash")) &&
    !currentPath.startsWith("/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/confirm";
    return NextResponse.redirect(url);
  }

  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  if (!env) {
    // Senza configurazione la home mostra un messaggio d'errore esplicativo.
    return response;
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // Importante: niente codice tra createServerClient e getClaims.
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
