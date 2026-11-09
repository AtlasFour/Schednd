import { describe, expect, it } from "vitest";
import { MESSAGES } from "../i18n/messages";
import { meetingSummaryLines, peopleByStatus, whatsappShareUrl } from "./share-text";

const base = {
  groupName: "GROUPHAVEN",
  date: "2026-11-18",
  startTime: "21:00:00",
  skipped: false,
  game: "Gloomhaven",
  location: "Da Marco",
  onlineLink: null,
  notes: null,
  minAttendees: 4,
  openProposals: 1,
};

describe("share text", () => {
  const people = peopleByStatus(
    [
      { user_id: "a", name: "Nicolas" },
      { user_id: "b", name: "Marco" },
      { user_id: "c", name: "Giulia" },
      { user_id: "d", name: "Anna" },
    ],
    [
      { user_id: "b", status: "yes" },
      { user_id: "a", status: "yes" },
      { user_id: "c", status: "maybe" },
    ],
    "it",
    "?",
  );

  it("groups people by answer, sorted", () => {
    expect(people).toEqual({ yes: ["Marco", "Nicolas"], maybe: ["Giulia"], no: [], noAnswer: ["Anna"] });
  });

  it("builds an Italian summary", () => {
    const lines = meetingSummaryLines({ ...base, people }, MESSAGES.it, "it");
    expect(lines[0]).toBe("*🎲 GROUPHAVEN*");
    expect(lines[1]).toBe("📅 Mercoledì 18 novembre 2026 · 21:00");
    expect(lines).toContain("✅ Ci sono (2): Marco, Nicolas");
    expect(lines).toContain("⏳ Senza risposta (1): Anna");
    expect(lines).toContain("⚠️ Mancano 2 giocatori");
    expect(lines).toContain("🗳️ 1 proposta da votare");
  });

  it("says when a meeting is skipped", () => {
    const lines = meetingSummaryLines({ ...base, skipped: true, people }, MESSAGES.en, "en", (t) => t);
    expect(lines).toEqual(["🎲 GROUPHAVEN", "📅 Wednesday, 18 November 2026 · 21:00", "", "⏭️ This meeting is off."]);
  });

  it("encodes the WhatsApp link", () => {
    expect(whatsappShareUrl("a b\n&")).toBe("https://wa.me/?text=a%20b%0A%26");
  });
});
