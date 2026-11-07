import { describe, expect, it } from "vitest";
import { accountServiceRows, accountTransactions } from "../customer360/account-overview";

describe("Customer 360 account visibility", () => {
  it("retains every recorded service category and its renewal date", () => {
    const keys = ["services", "subscriptions", "packages", "cloudServers", "webHosting", "starlink", "voip", "cloudStorage", "managedNas", "licenses", "assets"];
    const view = Object.fromEntries(keys.map(key => [key, [{ id: key, name: key, renewal_date: "2026-12-07" }]]));
    const rows = accountServiceRows(view);
    expect(rows).toHaveLength(11);
    expect(rows.map(r => r.key)).toEqual(keys.map(key => `${key}-${key}`));
    expect(rows.every(r => r.renewal === "2026-12-07")).toBe(true);
  });
  it("keeps unclassified managed services visible", () => {
    expect(accountServiceRows({ services: [{ id: "custom", service_name: "Custom service" }] })[0].title).toBe("Custom service");
  });
  it("shows all transactions without changing payments or mixing currencies", () => {
    const rows = accountTransactions({ invoices: [{ id: "i", total: 361.52, amount_paid: 0, currency: "USD", issue_date: "2026-11-07", status: "draft" }], payments: Array.from({ length: 12 }, (_, n) => ({ id: `p${n}`, amount: 10, currency: "ZAR", paid_at: "2026-11-06", status: "received" })) });
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({ kind: "Invoice", amount: 361.52, paid: 0, status: "draft", currency: "USD" });
    expect(rows[1]).toMatchObject({ kind: "Payment", amount: 10, currency: "ZAR" });
  });
});