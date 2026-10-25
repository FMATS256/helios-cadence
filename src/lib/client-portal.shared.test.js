import { describe, expect, test } from "bun:test";
import { clientPaymentSchema, clientTicketSchema, invoiceBalances, invoicePaymentAvailability, ownedProofPath } from "./client-portal.shared";

describe("client account portal rules", () => {
  const invoice = { id: "a", total: 200, balance: 200, currency: "USD", status: "sent" };
  const intent = { invoice_id: "a", amount: 200, currency: "USD", status: "SUCCESS", submission_id: "s" };
  test("successful full payment prevents a second payment before Finance approval", () => {
    const [row] = invoicePaymentAvailability([invoice], [intent], [], []);
    expect(row.payable).toBe(0);
    expect(row.balance).toBe(200);
    expect(row.paymentAwaitingApproval).toBe(true);
  });
  test("partial successful payment leaves only the unpaid amount payable", () => {
    expect(invoicePaymentAvailability([invoice], [{ ...intent, amount: 50 }], [], [])[0].payable).toBe(150);
  });
  test("failed payments do not hide the invoice payment action", () => {
    expect(invoicePaymentAvailability([invoice], [{ ...intent, status: "FAILED" }], [], [])[0].payable).toBe(200);
  });
  test("received allocations are not counted twice after Finance approval", () => {
    expect(invoicePaymentAvailability([{ ...invoice, balance: 150 }], [{ ...intent, amount: 50 }], [{ id: "s", payment_id: "p" }], [{ invoice_id: "a", payment_id: "p", amount: 50 }])[0].payable).toBe(150);
    expect(invoicePaymentAvailability([{ ...invoice, balance: 0 }], [intent], [{ id: "s", payment_id: "p" }], [{ invoice_id: "a", payment_id: "p", amount: 200 }])[0].payable).toBe(0);
  });
  test("another invoice or currency cannot suppress payment", () => {
    expect(invoicePaymentAvailability([invoice], [{ ...intent, invoice_id: "b" }, { ...intent, currency: "ZWG" }], [], [])[0].payable).toBe(200);
  });
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