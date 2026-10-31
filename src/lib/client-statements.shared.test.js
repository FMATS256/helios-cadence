import { describe, it, expect } from "vitest";
import { clientStatementDates, clientStatementRequest } from "./client-statements.shared";

describe("client statement availability", () => {
  it("includes a current statement for every account even before its first monthly cutoff", () => {
    expect(clientStatementDates("2026-10-25T10:00:00Z", new Date("2026-10-31T08:51:00Z"))).toEqual([{ date: "2026-10-31", current: true }]);
  });
  it("includes monthly statements on the 21st without future dates or duplicate current entries", () => {
    expect(clientStatementDates("2026-09-01", new Date("2026-11-20T22:00:00Z"))).toEqual([
      { date: "2026-11-21", current: true }, { date: "2026-10-21", current: false }, { date: "2026-09-21", current: false },
    ]);
  });
  it("never accepts a client-supplied account identity", () => {
    expect(clientStatementRequest.safeParse({ date: "2026-10-31", customer_id: "another-account" }).success).toBe(false);
  });
});