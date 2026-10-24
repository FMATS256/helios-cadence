import { describe, expect, test } from "bun:test";
import { IMT_ADDRESS, INVOICE_TERMS, initialsOf, invoiceSettlement, invoiceStudioPayload } from "./invoice-document.shared";

describe("invoice payment classification", () => {
  test("unpaid $200 invoice remains an invoice", () => {
    expect(invoiceSettlement({ total: 200, status: "sent" }, [])).toEqual({ paid: 0, balance: 200, settled: false, kind: "invoice" });
  });
  test("part payment remains an invoice", () => {
    expect(invoiceSettlement({ total: 200, status: "partial" }, [{ amount: 50 }]).kind).toBe("invoice");
  });
  test("full approved payment becomes a sales invoice", () => {
    expect(invoiceSettlement({ total: 200, status: "paid" }, [{ amount: 150 }, { amount: 50 }])).toEqual({ paid: 200, balance: 0, settled: true, kind: "sales_invoice" });
  });
  test("unallocated proof never becomes a sales invoice", () => {
    expect(invoiceSettlement({ total: 200, status: "paid" }, []).settled).toBe(false);
  });
  test("UK2AFRICA document preserves invoice identity and service", () => {
    const p = invoiceStudioPayload({ invoice_number: "INV-01024", total: 200, currency: "USD", issue_date: "2026-10-24", due_date: "2026-11-07" }, [{ description: "Microsoft 365", quantity: 1, unit_price: 200, tax_rate: 0 }], { company_name: "UK2AFRICA", account_number: "M10460" });
    expect(p.docNo).toBe("INV-01024"); expect(p.account).toBe("M10460"); expect(p.items[0].price).toBe(200); expect(p.expiry).toBe("07/11/2026");
  });
});