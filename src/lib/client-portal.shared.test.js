import { describe, expect, test } from "bun:test";
import { clientPaymentSchema, clientTicketSchema, invoiceBalances, ownedProofPath } from "./client-portal.shared";

describe("client account portal rules", () => {
  test("proof paths cannot reference another client or user", () => {
    expect(ownedProofPath("client/portal/user/proof.pdf", "client", "user")).toBe(true);
    expect(ownedProofPath("other/portal/user/proof.pdf", "client", "user")).toBe(false);
    expect(ownedProofPath("client/portal/other/proof.pdf", "client", "user")).toBe(false);
    expect(ownedProofPath("client/portal/user/../proof.pdf", "client", "user")).toBe(false);
  });
  test("invoice balance counts allocations and excludes drafts", () => {
    expect(invoiceBalances([{ id: "a", total: 120, status: "sent" }, { id: "b", total: 90, status: "draft" }], [{ invoice_id: "a", amount: 35 }])).toEqual([{ id: "a", total: 120, status: "sent", paid: 35, balance: 85 }]);
  });
  test("clients cannot choose ticket ownership or assignment", () => {
    expect(clientTicketSchema.safeParse({ subject: "Service issue", description: "Cannot connect", priority: "normal", customer_id: "other" }).success).toBe(false);
  });
  test("clients cannot approve a payment or omit proof", () => {
    const input = { request_id: "6c7aeac3-f3e9-4a5a-9684-d0c7542b0f58", invoice_id: null, amount: 50, currency: "USD", method: "bank_transfer", payment_date: "2026-10-20", reference: "BANK-123", proof: { path: "client/portal/user/proof.pdf", name: "proof.pdf", type: "application/pdf", size: 100 } };
    expect(clientPaymentSchema.safeParse(input).success).toBe(true);
    expect(clientPaymentSchema.safeParse({ ...input, status: "approved" }).success).toBe(false);
    expect(clientPaymentSchema.safeParse({ ...input, proof: undefined }).success).toBe(false);
  });
});