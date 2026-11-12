import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("safeNextPath", () => {
  it("accetta i percorsi interni", () => {
    expect(safeNextPath("/join/ABC123")).toBe("/join/ABC123");
    expect(safeNextPath("/groups/x/2026-11-18?a=1#proposte")).toBe("/groups/x/2026-11-18?a=1#proposte");
  });

  it("rifiuta indirizzi esterni e trucchi", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "evil", "", null]) {
      expect(safeNextPath(bad)).toBeNull();
    }
  });
});
