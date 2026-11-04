import { describe, expect, test } from "bun:test";
import { quotationDocument, round2 } from "./quotation-document.shared";

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

describe("starlink kit quotation (QT-2026-0004)", () => {
  // Lines as stored: line_total is a generated column that already includes VAT.
  const lines = [
    { description: "Starlink Kit", quantity: 1, unit_price: 260, tax_rate: 15.5, line_total: 300.3 },
    { description: "Starlink Flex Package (monthly)", quantity: 1, unit_price: 53, tax_rate: 15.5, line_total: 61.215 },
  ];

  test("sums the two lines to 313.00 before VAT", () => {
    const d = quotationDocument({ amount: 361.52, currency: "USD" }, lines);
    expect(d.subtotal).toBe(313);
  });

  test("charges 15.5% VAT of 48.52 on the 313.00 subtotal", () => {
    const d = quotationDocument({ amount: 361.52, currency: "USD" }, lines);
    expect(d.tax).toBe(48.52);
  });

  test("keeps VAT-inclusive line totals of 300.30 and 61.22", () => {
    const d = quotationDocument({ amount: 361.52, currency: "USD" }, lines);
    expect(d.items.map((item) => item.total)).toEqual([300.3, 61.22]);
  });

  test("adds up to 361.52 with no invented discount", () => {
    const d = quotationDocument({ amount: 361.52, currency: "USD" }, lines);
    expect(d.discount).toBe(0);
    expect(d.total).toBe(361.52);
    expect(round2(d.subtotal + d.tax - d.discount)).toBe(d.total);
  });
});
