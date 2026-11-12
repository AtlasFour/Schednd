import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAccessCookie, makeAccessCookie } from "./access-cookie";

describe("cookie di accesso", () => {
  beforeAll(() => {
    process.env.ACCESS_COOKIE_SECRET = "test-secret";
  });
  afterAll(() => {
    delete process.env.ACCESS_COOKIE_SECRET;
  });

  it("vale per lo stesso utente finché non scade", async () => {
    const now = Date.now();
    const value = (await makeAccessCookie("u1", now))!;
    expect(await checkAccessCookie(value, "u1", now)).toBe(true);
    expect(await checkAccessCookie(value, "u2", now)).toBe(false);
    expect(await checkAccessCookie(value, "u1", now + 11 * 60_000)).toBe(false);
  });

  it("rifiuta un cookie modificato", async () => {
    const value = (await makeAccessCookie("u1"))!;
    const [id, , sig] = value.split(".");
    expect(await checkAccessCookie(`${id}.9999999999.${sig}`, "u1")).toBe(false);
    expect(await checkAccessCookie("u1.9999999999.abc", "u1")).toBe(false);
    expect(await checkAccessCookie(undefined, "u1")).toBe(false);
  });
});
