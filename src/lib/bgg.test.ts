import { describe, expect, it } from "vitest";
import { parseBggCollection } from "./bgg";

const SAMPLE = `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<items totalitems="3" termsofuse="https://boardgamegeek.com/xmlapi/termsofuse" pubdate="Mon, 09 Nov 2026 10:00:00 +0000">
  <item objecttype="thing" objectid="13" subtype="boardgame" collid="1">
    <name sortindex="1">Catan</name>
    <yearpublished>1995</yearpublished>
    <image>https://cf.geekdo-images.com/catan.jpg</image>
    <thumbnail>https://cf.geekdo-images.com/catan_t.jpg</thumbnail>
    <stats minplayers="3" maxplayers="4" minplaytime="60" maxplaytime="120" playingtime="120" numowned="200000">
      <rating value="N/A"><average value="7.1" /></rating>
    </stats>
    <status own="1" prevowned="0" fortrade="0" want="0" wanttoplay="0" wanttobuy="0" wishlist="0" preordered="0" lastmodified="2024-01-01 10:00:00" />
    <numplays>3</numplays>
  </item>
  <item objecttype="thing" objectid="174430" subtype="boardgame" collid="2">
    <name sortindex="1">Gloomhaven</name>
    <stats minplayers="1" maxplayers="4" minplaytime="60" maxplaytime="120" playingtime="0" />
  </item>
  <item objecttype="thing" objectid="999" subtype="boardgame" collid="3">
    <name sortindex="5">The 7th Continent</name>
    <thumbnail>//cf.geekdo-images.com/old.jpg</thumbnail>
  </item>
</items>`;

describe("parseBggCollection", () => {
  it("legge titoli, giocatori, durata, anno e immagini", () => {
    const games = parseBggCollection(SAMPLE);
    expect(games).toEqual([
      {
        bgg_id: 13,
        title: "Catan",
        min_players: 3,
        max_players: 4,
        playing_minutes: 120,
        year: 1995,
        image_url: "https://cf.geekdo-images.com/catan_t.jpg",
      },
      {
        bgg_id: 174430,
        title: "Gloomhaven",
        min_players: 1,
        max_players: 4,
        playing_minutes: 120,
        year: null,
        image_url: null,
      },
      {
        bgg_id: 999,
        title: "The 7th Continent",
        min_players: null,
        max_players: null,
        playing_minutes: null,
        year: null,
        image_url: null,
      },
    ]);
  });

  it("collezione vuota", () => {
    expect(parseBggCollection(`<items totalitems="0"></items>`)).toEqual([]);
  });

  it("utente inesistente", () => {
    const res = parseBggCollection(
      `<errors><error><message>Invalid username specified</message></error></errors>`,
    );
    expect(res).toEqual({ error: "Invalid username specified" });
  });
});
