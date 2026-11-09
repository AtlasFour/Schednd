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
  const { formatDuration } = await import("./groups");
  it("formatta le durate", () => {
    expect(formatDuration(60)).toBe("1 ora");
    expect(formatDuration(90)).toBe("1 ora e mezza");
    expect(formatDuration(210)).toBe("3 ore e mezza");
    expect(formatDuration(240)).toBe("4 ore");
  });
});
