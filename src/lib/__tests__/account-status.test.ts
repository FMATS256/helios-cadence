import { describe, expect, it } from "vitest";
import { activeAccountServiceCount, accountToday, accountWarnings, invoiceOverdue, serviceStatusTone } from "../customer360/account-status";

const today = "2026-11-07";
describe("Customer 360 account warnings", () => {
  it("marks active services green", () => {
    for (const status of ["active", "running", "online", "on", "up", "deployed", "in_use"]) expect(serviceStatusTone(status)).toBe("success");
  });
  it("marks inactive services red", () => {
    for (const status of ["inactive", "paused", "suspended", "cancelled", "terminated", "stopped", "pending"]) expect(serviceStatusTone(status)).toBe("danger");
  });
  it("warns about unpaid past-due invoices, not paid or draft invoices", () => {
    const invoice = { total: 361.52, amount_paid: 0, due_date: "2026-11-06", status: "issued" };
    expect(invoiceOverdue(invoice, today)).toBe(true);
    expect(invoiceOverdue({ ...invoice, amount_paid: 361.52 }, today)).toBe(false);
    expect(invoiceOverdue({ ...invoice, status: "draft" }, today)).toBe(false);
    expect(invoiceOverdue({ ...invoice, due_date: today }, today)).toBe(false);
  });
  it("warns about overdue active service renewals and expired licences", () => {
    const warnings = accountWarnings({ subscriptions: [{ id: "s", plan_name: "Support", status: "active", next_renewal: "2026-11-06" }] }, [{ id: "l", vendor: "sophos", product: "Endpoint", status: "active", expiry_date: "2026-11-06" }], today);
    expect(warnings.map(w => w.key)).toContain("subscriptions-s-renewal");
    expect(warnings.map(w => w.key)).toContain("lic-l-expiry");
  });
  it("flags missing contact and subscription date without inventing expiry for hardware", () => {
    const warnings = accountWarnings({ customer: { primary_email: "client@example.com", primary_phone: "123" }, subscriptions: [{ id: "s", status: "active" }], assets: [{ id: "a", status: "active" }] }, [], today);
    expect(warnings.find(w => w.key === "contact")?.message).toBe("Missing account information: billing address.");
    expect(warnings.map(w => w.key)).toContain("subscriptions-s-date");
    expect(warnings.some(w => w.key.startsWith("assets-"))).toBe(false);
  });
  it("uses the Harare date at the UTC day boundary", () => {
    expect(accountToday(new Date("2026-11-06T23:00:00Z"))).toBe("2026-11-07");
  });
  it("counts active services across account categories and excludes inactive records and equipment", () => {
    expect(activeAccountServiceCount({ subscriptions: [{ id: "s", status: "active" }], starlink: [{ id: "k", status: "active" }], licenses: [{ id: "l", status: "active" }], webHosting: [{ id: "h", status: "suspended" }], assets: [{ id: "a", status: "active" }] })).toBe(3);
  });
  it("counts a package and its linked billing subscription as one service", () => {
    expect(activeAccountServiceCount({ subscriptions: [{ id: "s", status: "active" }], packages: [{ id: "p", subscription_id: "s", status: "active" }] })).toBe(1);
  });
  it("does not count an inactive resource as active through its billing subscription", () => {
    expect(activeAccountServiceCount({ subscriptions: [{ id: "s", status: "active" }], packages: [{ id: "p", subscription_id: "s", status: "suspended" }] })).toBe(0);
  });
  it("reports zero services for an account without saved service records", () => {
    expect(activeAccountServiceCount({ customer: { company_name: "Uk2africa" } })).toBe(0);
  });
});