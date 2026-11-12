import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { NEXT_PATH_COOKIE } from "../next-path";
import { getSupabaseEnv } from "./env";
import { ACCESS_COOKIE, ACCESS_COOKIE_TTL, checkAccessCookie, makeAccessCookie } from "./access-cookie";
import { USER_HEADER } from "./user-header";

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

  // Nessuno può mandare questo header da fuori: lo scrive solo il proxy.
  request.headers.delete(USER_HEADER);
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
  const claims = data?.claims;
  const isLoggedIn = Boolean(claims?.sub);

  const { pathname } = request.nextUrl;

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const redirect = NextResponse.redirect(url);
    if (pathname !== "/") {
      // Dopo il login si torna qui (es. a un link d'invito).
      redirect.cookies.set(NEXT_PATH_COOKIE, pathname + request.nextUrl.search, {
        path: "/",
        maxAge: 60 * 60,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
    return redirect;
  }

  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Accesso su approvazione: ogni tanto si ricontrolla che l'utente sia
  // ancora approvato (chi viene bloccato esce entro qualche minuto).
  let accessCookie: string | null = null;
  if (claims?.sub && !isPublicPath(pathname)) {
    const cached = await checkAccessCookie(request.cookies.get(ACCESS_COOKIE)?.value, claims.sub);
    if (!cached) {
      const { data: access, error } = await supabase.rpc("my_access_status");
      if (error) {
        // Problema momentaneo: si lascia passare e si riprova alla prossima pagina.
        console.error("my_access_status", error.message);
      } else if (access !== "approved") {
        await supabase.auth.signOut();
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.search = `?errore=${access === "blocked" ? "bloccato" : "in_attesa"}`;
        const redirect = NextResponse.redirect(url);
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        redirect.cookies.delete(ACCESS_COOKIE);
        return redirect;
      } else {
        accessCookie = await makeAccessCookie(claims.sub);
      }
    }
  }

  if (claims?.sub) {
    // Le pagine leggono l'utente già verificato qui, senza chiederlo di nuovo
    // a Supabase (una richiesta in meno per ogni pagina).
    request.headers.set(
      USER_HEADER,
      encodeURIComponent(JSON.stringify({ sub: claims.sub, email: claims.email ?? "" })),
    );
    const next = NextResponse.next({ request });
    response.cookies.getAll().forEach((cookie) => next.cookies.set(cookie));
    if (accessCookie) {
      next.cookies.set(ACCESS_COOKIE, accessCookie, {
        path: "/",
        maxAge: ACCESS_COOKIE_TTL,
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
      });
    }
    response.headers.forEach((value, key) => {
      if (!key.startsWith("x-middleware-") && key !== "set-cookie") next.headers.set(key, value);
    });
    return next;
  }

  return response;
}
