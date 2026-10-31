import { describe, it, expect } from "vitest";
import { BILLING_MAILBOX, validEmailPayment } from "./finance-billing.shared";

describe("billing email payment safety", () => {
  it("uses the requested billing sender", () => expect(BILLING_MAILBOX).toBe("billing@imtsolutions.co.zw"));
  it("rejects claims for a different customer", () => expect(validEmailPayment(15, "USD", "A", { customer_id: "B", currency: "USD" })).toBe(false));
  it("rejects mismatched invoice currency", () => expect(validEmailPayment(15, "USD", "A", { customer_id: "A", currency: "ZWG" })).toBe(false));
  it("rejects zero or invalid payment amounts", () => { expect(validEmailPayment(0, "USD", "A", null)).toBe(false); expect(validEmailPayment(NaN, "USD", "A", null)).toBe(false); });
  it("accepts a positive matching claim for Finance verification", () => expect(validEmailPayment(15, "USD", "A", { customer_id: "A", currency: "USD" })).toBe(true));
});