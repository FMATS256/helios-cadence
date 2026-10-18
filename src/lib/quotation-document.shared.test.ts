import { describe, expect, test } from "bun:test";
import { quotationDocument } from "./quotation-document.shared";

describe("saved quotation values", () => {
  test("preserves the saved total and existing item tax rates", () => {
    const d = quotationDocument({ amount: 221, currency: "USD" }, [{ quantity: 2, unit_price: 100, line_total: 200, tax_rate: 15.5 }]);
    expect(d.subtotal).toBe(200);
    expect(d.tax).toBe(31);
    expect(d.discount).toBe(10);
    expect(d.total).toBe(221);
  });
  test("preserves legacy quotations without saved line items", () => {
    const d = quotationDocument({ title: "Saved quotation", amount: 468.5 }, []);
    expect(d.total).toBe(468.5);
    expect(d.items[0]?.total).toBe(468.5);
    expect(d.tax).toBe(0);
    expect(d.discount).toBe(0);
  });
});