import { describe, it, expect } from "vitest";
import { canRecoverPortal, ownPortfolioOnly, recoveryTargetAllowed, portfolioCustomerAllowed } from "./account-workspace.shared";
describe("account workspace boundaries", () => {
  it("managers cannot dispatch for another portfolio", () => expect(portfolioCustomerAllowed(["account_manager"], "A", "B")).toBe(false));
  it("managers can dispatch for their assigned account", () => expect(portfolioCustomerAllowed(["account_manager"], "A", "A")).toBe(true));
  it("NOC can send client portal recovery", () => expect(canRecoverPortal(["noc"])).toBe(true));
  it("account managers cannot reset passwords", () => expect(canRecoverPortal(["account_manager"])).toBe(false));
  it("account managers default to their assigned portfolio", () => expect(ownPortfolioOnly(["corporate_account_manager"])).toBe(true));
  it("a different customer's profile is not a recovery target", () => expect(recoveryTargetAllowed("A", { customer_id: "B" }, [])).toBe(false));
  it("staff profiles cannot be recovered through client controls", () => expect(recoveryTargetAllowed("A", { customer_id: "A" }, ["finance"])).toBe(false));
  it("linked client profiles are valid targets", () => expect(recoveryTargetAllowed("A", { customer_id: "A" }, [])).toBe(true));
});