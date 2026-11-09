import { XMLParser } from "fast-xml-parser";

/**
 * Lettura della collezione di un utente da BoardGameGeek (XML API2).
 * Dal 2025 BGG richiede un'applicazione registrata e un token
 * (boardgamegeek.com/applications), da mettere in BGG_API_TOKEN.
 */

export type BggGame = {
  bgg_id: number;
  title: string;
  min_players: number | null;
  max_players: number | null;
  playing_minutes: number | null;
  year: number | null;
  image_url: string | null;
};

export type BggErrorReason =
  | "not_configured"
  | "queued"
  | "not_found"
  | "unauthorized"
  | "rate_limited"
  | "unreachable"
  | "http_error"
  | "bgg_error";

/** In caso di errore: il motivo (tradotto dall'app) e un dettaglio facoltativo. */
export type BggResult =
  | { ok: true; games: BggGame[] }
  | { ok: false; reason: BggErrorReason; detail?: string };

const API = "https://boardgamegeek.com/xmlapi2/collection";

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function text(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return text((value as { "#text": unknown })["#text"]);
  }
  return null;
}

/** Converte l'XML della collezione BGG nell'elenco dei giochi posseduti. */
export function parseBggCollection(xml: string): BggGame[] | { error: string } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    isArray: (name) => name === "item" || name === "error",
  });
  const doc = parser.parse(xml);

  const errors = doc?.errors?.error ?? doc?.error;
  if (errors) {
    const first = Array.isArray(errors) ? errors[0] : errors;
    return { error: text(first?.message) ?? "Errore da BoardGameGeek." };
  }

  const items: Record<string, unknown>[] = doc?.items?.item ?? [];
  const games: BggGame[] = [];
  for (const item of items) {
    const id = num(item.objectid);
    const title = text(item.name);
    if (!id || !title) continue;
    const stats = (item.stats ?? {}) as Record<string, unknown>;
    const image = text(item.thumbnail) ?? text(item.image);
    games.push({
      bgg_id: id,
      title,
      min_players: num(stats.minplayers),
      max_players: num(stats.maxplayers),
      playing_minutes: num(stats.playingtime) ?? num(stats.maxplaytime),
      year: num(item.yearpublished),
      image_url: image && image.startsWith("https://") ? image : null,
    });
  }
  return games;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scarica i giochi posseduti (senza espansioni). BGG risponde 202 quando
 * sta ancora preparando la collezione: si riprova qualche volta.
 */
export async function fetchBggCollection(username: string): Promise<BggResult> {
  const token = process.env.BGG_API_TOKEN;
  if (!token) {
    return { ok: false, reason: "not_configured" };
  }

  const url = `${API}?${new URLSearchParams({
    username,
    own: "1",
    stats: "1",
    excludesubtype: "boardgameexpansion",
  })}`;

  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/xml" },
        cache: "no-store",
      });
    } catch (err) {
      console.error("bgg fetch", err);
      return { ok: false, reason: "unreachable" };
    }

    if (res.status === 202) {
      await sleep(2500);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "unauthorized" };
    }
    if (res.status === 429) {
      return { ok: false, reason: "rate_limited" };
    }
    if (!res.ok) {
      return { ok: false, reason: "http_error", detail: String(res.status) };
    }

    const parsed = parseBggCollection(await res.text());
    if ("error" in parsed) {
      const notFound = /invalid username|not found/i.test(parsed.error);
      return notFound
        ? { ok: false, reason: "not_found", detail: username }
        : { ok: false, reason: "bgg_error", detail: parsed.error };
    }
    return { ok: true, games: parsed };
  }

  return { ok: false, reason: "queued" };
}
