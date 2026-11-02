import { describe, it, expect } from "vitest";
import { splitByPackage } from "./package-billing";

describe("splitByPackage", () => {
  it("shares an invoice's paid amount across packages by line total", () => {
    const rows = splitByPackage(
      [{ id: "i1", total: 110, amount_paid: 55, currency: "USD" }],
      [
        { invoice_id: "i1", description: "Web Starter", item_code: "HOST-WEB-STARTER", line_total: 63 },
        { invoice_id: "i1", description: "Mail Starter", item_code: "MAIL-STARTER", line_total: 47 },
      ],
    );
    const web = rows.find((r) => r.name === "Web Starter")!;
    const mail = rows.find((r) => r.name === "Mail Starter")!;
    expect(web.paid).toBe(31.5);
    expect(mail.paid).toBe(23.5);
    expect(web.outstanding).toBe(31.5);
  });

  it("groups the same package across invoices", () => {
    const rows = splitByPackage(
      [{ id: "a", total: 63, amount_paid: 63, currency: "USD" }, { id: "b", total: 63, amount_paid: 0, currency: "USD" }],
      [{ invoice_id: "a", description: "Web Starter", item_code: "HOST-WEB-STARTER", line_total: 63 }, { invoice_id: "b", description: "Web Starter 2027", item_code: "HOST-WEB-STARTER", line_total: 63 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ billed: 126, paid: 63, outstanding: 63, invoices: 2 });
  });
});
