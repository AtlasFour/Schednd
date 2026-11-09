import { describe, expect, it } from "vitest";
import {
  addDays,
  describeRecurrence,
  relativeDay,
  todayInTimeZone,
  upcomingDates,
  weekdayName,
  type Schedule,
} from "./schedule";

const weekly = (anchorDate: string, extra: Partial<Schedule> = {}): Schedule => ({
  anchorDate,
  intervalWeeks: 1,
  startTime: "21:00:00",
  validUntil: null,
  ...extra,
});

describe("upcomingDates", () => {
  it("parte dall'ancora se è nel futuro", () => {
    const dates = upcomingDates([weekly("2026-11-18")], "2026-11-09", 3);
    expect(dates.map((d) => d.date)).toEqual([
      "2026-11-18",
      "2026-11-25",
      "2026-12-02",
    ]);
  });

  it("include oggi se oggi è un giorno di gioco", () => {
    const dates = upcomingDates([weekly("2026-10-07")], "2026-11-11", 2);
    expect(dates.map((d) => d.date)).toEqual(["2026-11-11", "2026-11-18"]);
  });

  it("rispetta l'intervallo di 2 settimane a partire dall'ancora", () => {
    // Sessione C: ogni 2 venerdì a partire dal 6 novembre 2026.
    const s = weekly("2026-11-06", { intervalWeeks: 2 });
    const dates = upcomingDates([s], "2026-11-09", 3);
    expect(dates.map((d) => d.date)).toEqual([
      "2026-11-20",
      "2026-12-04",
      "2026-12-18",
    ]);
  });

  it("gestisce intervalli di 4 settimane", () => {
    const s = weekly("2026-01-03", { intervalWeeks: 4 });
    const dates = upcomingDates([s], "2026-11-09", 2);
    expect(dates.map((d) => d.date)).toEqual(["2026-12-05", "2027-01-02"]);
  });

  it("unisce la ricorrenza chiusa e la nuova dopo un cambio di giorno", () => {
    const old = weekly("2026-10-07", { validUntil: "2026-11-12" }); // mercoledì
    const next = weekly("2026-11-19", { startTime: "20:30:00" }); // giovedì
    const dates = upcomingDates([next, old], "2026-11-09", 3);
    expect(dates).toEqual([
      { date: "2026-11-11", startTime: "21:00:00" },
      { date: "2026-11-19", startTime: "20:30:00" },
      { date: "2026-11-26", startTime: "20:30:00" },
    ]);
  });

  it("non va oltre il cambio dell'ora legale né si sposta di un giorno", () => {
    const dates = upcomingDates([weekly("2026-03-25")], "2026-03-25", 2);
    expect(dates.map((d) => d.date)).toEqual(["2026-03-25", "2026-04-01"]);
  });
});

describe("utilità per le date", () => {
  it("addDays attraversa i mesi", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("weekdayName", () => {
    expect(weekdayName("2026-11-11")).toBe("mercoledì");
    expect(weekdayName("2026-11-15")).toBe("domenica");
    expect(weekdayName("2026-11-16")).toBe("lunedì");
  });

  it("describeRecurrence", () => {
    expect(describeRecurrence(weekly("2026-11-11"))).toBe(
      "ogni mercoledì alle 21:00",
    );
    expect(
      describeRecurrence(weekly("2026-11-06", { intervalWeeks: 2 })),
    ).toBe("ogni 2 settimane, di venerdì, alle 21:00");
  });

  it("relativeDay", () => {
    expect(relativeDay("2026-11-09", "2026-11-09")).toBe("oggi");
    expect(relativeDay("2026-11-10", "2026-11-09")).toBe("domani");
    expect(relativeDay("2026-11-14", "2026-11-09")).toBe("tra 5 giorni");
  });

  it("todayInTimeZone usa il fuso indicato", () => {
    const lateNightUtc = new Date("2026-11-09T23:30:00Z");
    expect(todayInTimeZone("Europe/Rome", lateNightUtc)).toBe("2026-11-10");
    expect(todayInTimeZone("UTC", lateNightUtc)).toBe("2026-11-09");
  });
});

describe("formatDuration", async () => {
  const { it: itMsg } = await import("../i18n/messages/it");
  const formatDuration = itMsg.labels.duration;
  it("formatta le durate", () => {
    expect(formatDuration(60)).toBe("1 ora");
    expect(formatDuration(90)).toBe("1 ora e mezza");
    expect(formatDuration(210)).toBe("3 ore e mezza");
    expect(formatDuration(240)).toBe("4 ore");
  });
});

describe("isScheduledDate / scheduledTimeFor", async () => {
  const { isScheduledDate, scheduledTimeFor } = await import("./schedule");
  const s = weekly("2026-11-06", { intervalWeeks: 2, startTime: "20:30:00" });
  it("riconosce le date della ricorrenza", () => {
    expect(isScheduledDate([s], "2026-11-20")).toBe(true);
    expect(isScheduledDate([s], "2026-11-13")).toBe(false);
    expect(isScheduledDate([s], "2026-10-23")).toBe(false);
  });
  it("rispetta la fine della ricorrenza", () => {
    const old = { ...s, validUntil: "2026-11-20" };
    expect(isScheduledDate([old], "2026-11-20")).toBe(false);
    expect(scheduledTimeFor([old], "2026-11-06")).toBe("20:30:00");
    expect(scheduledTimeFor([old], "2026-11-20")).toBeUndefined();
  });
});

describe("capitalize", async () => {
  const { capitalize, formatShortDate } = await import("./schedule");
  it("solo la prima lettera", () => {
    expect(capitalize(formatShortDate("2026-11-18"))).toBe("Mer 18 nov");
  });
});

describe("zonedTimestamp", async () => {
  const { zonedTimestamp } = await import("./schedule");
  it("ora solare e ora legale a Roma", () => {
    expect(new Date(zonedTimestamp("2026-11-18", "21:00", "Europe/Rome")).toISOString()).toBe(
      "2026-11-18T20:00:00.000Z",
    );
    expect(new Date(zonedTimestamp("2026-07-15", "21:00:00", "Europe/Rome")).toISOString()).toBe(
      "2026-07-15T19:00:00.000Z",
    );
  });
});

describe("hoursUntil", async () => {
  const { hoursUntil } = await import("./schedule");
  it("calcola le ore mancanti nel fuso del gruppo", () => {
    const now = new Date("2026-11-17T20:00:00Z"); // 21:00 a Roma
    expect(hoursUntil("2026-11-18", "21:00", "Europe/Rome", now)).toBe(24);
  });
});

describe("library helpers", async () => {
  const { fitsPlayers } = await import("./library");
  const { it: itMsg } = await import("../i18n/messages/it");
  const formatPlayers = itMsg.labels.players;
  const formatPlayingTime = itMsg.labels.playingTime;
  it("formatta giocatori e durata", () => {
    expect(formatPlayers(3, 4)).toBe("3–4 giocatori");
    expect(formatPlayers(2, 2)).toBe("2 giocatori");
    expect(formatPlayers(null, null)).toBeNull();
    expect(formatPlayingTime(45)).toBe("45 min");
    expect(formatPlayingTime(120)).toBe("2 ore");
    expect(formatPlayingTime(150)).toBe("2 h 30");
  });
  it("filtra per numero di giocatori", () => {
    expect(fitsPlayers({ min_players: 3, max_players: 4 }, 5)).toBe(false);
    expect(fitsPlayers({ min_players: 3, max_players: 4 }, 4)).toBe(true);
    expect(fitsPlayers({ min_players: null, max_players: null }, 9)).toBe(true);
  });
});

describe("meetingsBetween", async () => {
  const { meetingsBetween } = await import("./meetings");
  const group = {
    id: "g",
    name: "G",
    timezone: "Europe/Rome",
    default_game_title: null,
    default_location: null,
    min_attendees: null,
    memberCount: 3,
    group_schedules: [
      { id: "s", anchor_date: "2026-10-07", interval_weeks: 1, start_time: "21:00:00", valid_until: null },
    ],
  };
  it("restituisce gli incontri del mese, anche passati e spostati", () => {
    const moved = {
      id: "o",
      group_id: "g",
      original_date: "2026-11-25",
      start_date: "2026-12-02",
      start_time: "20:00:00",
      status: "scheduled" as const,
      game_title_override: null,
      location_override: null,
      notes: null,
      attendances: [],
    };
    const ms = meetingsBetween(group, [moved], "u", "2026-11-01", "2026-11-30");
    expect(ms.map((m) => m.date)).toEqual(["2026-11-04", "2026-11-11", "2026-11-18"]);
    const dec = meetingsBetween(group, [moved], "u", "2026-12-01", "2026-12-31");
    expect(dec.map((m) => m.date).sort()).toEqual([
      "2026-12-02",
      "2026-12-02",
      "2026-12-09",
      "2026-12-16",
      "2026-12-23",
      "2026-12-30",
    ]);
  });
});
