import { describe, it, expect } from "vitest";
import { anchoredSubscriptionDate, subscriptionCycleMonths } from "./subscription-billing.shared";

describe("creation-date subscription billing", () => {
  it("bills a monthly subscription on its creation day next month", () => expect(anchoredSubscriptionDate("2026-10-28", 1)).toBe("2026-11-28"));
  it("waits for all three paid months", () => expect(anchoredSubscriptionDate("2026-10-31", 3)).toBe("2027-01-31"));
  it("clamps short months without losing the original billing day", () => {
    expect(anchoredSubscriptionDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(anchoredSubscriptionDate("2026-01-31", 2)).toBe("2026-03-31");
  });
  it("recognizes the annual cycle used by the subscription form", () => expect(subscriptionCycleMonths("annually")).toBe(12));
});