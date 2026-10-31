import { describe, it, expect } from "vitest";
import { STATEMENT_MAILBOX, statementWindow, statementModel } from "./statement-document.shared";
describe("monthly client statements", () => {
  it("uses finance rather than billing for monthly documents", () => expect(STATEMENT_MAILBOX).toBe("finance@imtsolutions.co.zw"));
  it("runs on the 21st in Harare", () => {
    expect(statementWindow(new Date("2026-11-20T22:00:00Z"))).toEqual({ period: "2026-11", from: "2026-11-01", to: "2026-11-21", due: true });
    expect(statementWindow(new Date("2026-11-21T22:00:00Z")).due).toBe(false);
  });
  it("counts only received funds and separates currencies", () => {
    const s = statementModel({}, [{ total: 200, amount_paid: 0, status: "sent", currency: "USD", issue_date: "2026-11-01", due_date: "2026-11-30", invoice_number: "INV-1" }], [
      { amount: 20, status: "received", currency: "USD", paid_at: "2026-11-02", receipt_number: "R1" },
      { amount: 200, status: "pending", currency: "USD", paid_at: "2026-11-03" },
      { amount: 200, status: "received", currency: "ZAR", paid_at: "2026-11-03" },
    ], [], "2026-11-01", "2026-11-21", "USD");
    expect(s.closing).toBe(180); expect(s.totalCredit).toBe(20); expect(s.ageing).toEqual([200, 0, 0, 0, 0]);
  });
});