import { describe, expect, it } from "vitest";
import { buildIcs, googleCalendarUrl, googleSubscribeUrl, type CalendarEvent } from "./ics";

const event: CalendarEvent = {
  uid: "g1-2026-11-18@schednd",
  title: "🎲 Sessione A – D&D · Gloomhaven",
  description: "Note: porta i dadi, la mappa; e la pizza",
  location: "Da Marco, via Roma 1",
  url: "https://schednd.vercel.app/groups/g1/2026-11-18",
  date: "2026-11-18",
  time: "21:00:00",
  timeZone: "Europe/Rome",
  durationMinutes: 210,
};

describe("ics", () => {
  it("converte l'ora di Roma in UTC e calcola la fine", () => {
    const ics = buildIcs([event], "Schednd", Date.UTC(2026, 10, 9, 12));
    expect(ics).toContain("DTSTART:20261118T200000Z");
    expect(ics).toContain("DTEND:20261118T233000Z");
    expect(ics).toContain("UID:g1-2026-11-18@schednd");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });

  it("protegge virgole e punti e virgola e spezza le righe lunghe", () => {
    const ics = buildIcs([event]);
    expect(ics).toContain("LOCATION:Da Marco\\, via Roma 1");
    expect(ics).toContain("porta i dadi\\, la mappa\; e la pizza");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("segna gli incontri saltati come annullati", () => {
    expect(buildIcs([{ ...event, cancelled: true }])).toContain("STATUS:CANCELLED");
  });

  it("link Google Calendar e abbonamento", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.searchParams.get("dates")).toBe("20261118T200000Z/20261118T233000Z");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(googleSubscribeUrl("https://x.app/api/calendar/abc")).toBe(
      "https://calendar.google.com/calendar/r?cid=webcal%3A%2F%2Fx.app%2Fapi%2Fcalendar%2Fabc",
    );
  });
});
