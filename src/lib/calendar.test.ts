import { describe, expect, it } from "vitest";
import {
  firstDay,
  lastDay,
  monthGrid,
  monthLabel,
  parseMonth,
  shiftMonth,
} from "./calendar";

describe("calendar", () => {
  it("parseMonth", () => {
    expect(parseMonth("2026-11")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13")).toBeNull();
    expect(parseMonth(undefined)).toBeNull();
  });

  it("shiftMonth attraversa l'anno", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });

  it("primo e ultimo giorno, anche a febbraio bisestile", () => {
    expect(firstDay({ year: 2026, month: 11 })).toBe("2026-11-01");
    expect(lastDay({ year: 2026, month: 11 })).toBe("2026-11-30");
    expect(lastDay({ year: 2028, month: 2 })).toBe("2028-02-29");
  });

  it("griglia da lunedì: novembre 2026 inizia di domenica", () => {
    const grid = monthGrid({ year: 2026, month: 11 });
    expect(grid[0][0]).toBe("2026-10-26");
    expect(grid[0][6]).toBe("2026-11-01");
    expect(grid.at(-1)?.at(-1)).toBe("2026-12-06");
    expect(grid).toHaveLength(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
  });

  it("monthLabel", () => {
    expect(monthLabel({ year: 2026, month: 11 })).toBe("Novembre 2026");
  });
});
