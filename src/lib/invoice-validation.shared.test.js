import { describe, expect, test } from "bun:test";
import { priceInvoiceItems, validateInvoiceDates, invoiceLineDescription } from "./invoice-validation.shared";
import { invoiceSettlement } from "./invoice-document.shared";
const line = { description: "Microsoft 365 Business Standard", item_code: "M365-BUS-STANDARD", quantity: 1, unit_price: 200, billing_period_start: "2026-10-24", billing_period_end: "2026-11-23" };
describe("invoice content and accounting rules", () => {
  test("every product requires a SKU", () => expect(() => priceInvoiceItems([{ ...line, item_code: "" }])).toThrow("SKU"));
  test("Microsoft product cannot be generic", () => expect(() => priceInvoiceItems([{ ...line, description: "Microsoft 365 subscription" }])).toThrow("exact"));
  test("Microsoft requires an exact billing period", () => expect(() => priceInvoiceItems([{ ...line, billing_period_start: null }])).toThrow());
  test("200 invoice has exact tax-free totals", () => expect(priceInvoiceItems([line]).total).toBe(200));
  test("VAT cannot silently enter a no-VAT invoice", () => expect(() => priceInvoiceItems([{ ...line, tax_rate: 15 }])).toThrow("VAT"));
  test("negative pricing is rejected", () => expect(() => priceInvoiceItems([{ ...line, unit_price: -1 }])).toThrow());
  test("due date cannot precede issue date", () => expect(() => validateInvoiceDates("2026-10-24", "2026-10-23")).toThrow());
  test("impossible invoice date is rejected", () => expect(() => validateInvoiceDates("2026-02-30", "2026-03-20")).toThrow());
  test("PDF description includes exact period", () => expect(invoiceLineDescription(line)).toBe("Microsoft 365 Business Standard | 24/10/2026 - 23/11/2026"));
  test("failed payment is not a paid invoice", () => expect(invoiceSettlement({ total: 200, status: "sent" }, [{ amount: 200, payments: { status: "failed" } }]).paid).toBe(0));
  test("received allocation reduces only invoice balance", () => expect(invoiceSettlement({ total: 200, status: "partial" }, [{ amount: 50, payments: { status: "received" } }]).balance).toBe(150));
});