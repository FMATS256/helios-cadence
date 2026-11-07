import { accountServiceRows } from "./account-overview";

const activeStates = new Set(["active", "running", "online", "deployed", "in_use", "in use"]);
export function serviceStatusTone(status?: string | null): "success" | "danger" {
  return activeStates.has(String(status || "").trim().toLowerCase()) ? "success" : "danger";
}

export function accountToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Harare", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function dateOverdue(date: unknown, today = accountToday()): boolean {
  return typeof date === "string" && Number.isFinite(Date.parse(date)) && date.slice(0, 10) < today;
}

export function invoiceOverdue(invoice: Record<string, any>, today = accountToday()): boolean {
  if (["paid", "void", "voided", "cancelled", "draft"].includes(String(invoice.status).toLowerCase())) return false;
  return Number(invoice.total || 0) - Number(invoice.amount_paid || 0) > 0.01 && (dateOverdue(invoice.due_date, today) || invoice.status === "overdue");
}

export type AccountWarning = { key: string; message: string; tab: "services" | "invoices" | "licences" | "overview" };
export function accountWarnings(view: Record<string, any>, licenses: Record<string, any>[] = [], today = accountToday()): AccountWarning[] {
  const warnings: AccountWarning[] = [];
  const customer = view.customer || {};
  const missing = [["primary_email", "email"], ["primary_phone", "phone number"], ["billing_address", "billing address"]].filter(([field]) => !String(customer[field] || "").trim()).map(([, name]) => name);
  if (missing.length) warnings.push({ key: "contact", message: `Missing account information: ${missing.join(", ")}.`, tab: "overview" });
  for (const invoice of view.invoices || []) {
    if (invoiceOverdue(invoice, today)) warnings.push({ key: `invoice-${invoice.id}`, message: `${invoice.invoice_number || "Invoice"}: overdue with an unpaid balance${invoice.due_date ? ` (due ${invoice.due_date.slice(0, 10)})` : ""}.`, tab: "invoices" });
  }
  for (const row of accountServiceRows(view)) {
    const knownStatus = row.status !== "Recorded";
    if (!knownStatus) warnings.push({ key: `${row.key}-status`, message: `${row.title}: service status not recorded.`, tab: "services" });
    else if (serviceStatusTone(row.status) === "danger") warnings.push({ key: `${row.key}-inactive`, message: `${row.title}: ${row.status.replace(/_/g, " ")}.`, tab: "services" });
    if (knownStatus && serviceStatusTone(row.status) === "success" && dateOverdue(row.renewal, today)) warnings.push({ key: `${row.key}-renewal`, message: `${row.title}: renewal / expiry overdue (${row.renewal?.slice(0, 10)}).`, tab: "services" });
    if (row.kind === "Subscription" && !row.renewal) warnings.push({ key: `${row.key}-date`, message: `${row.title}: renewal date not recorded.`, tab: "services" });
  }
  for (const license of licenses) {
    const name = `${license.vendor || "Software"} ${license.product || "licence"}`;
    if (serviceStatusTone(license.status) === "danger") warnings.push({ key: `lic-${license.id}-status`, message: `${name}: ${license.status || "status not recorded"}.`, tab: "licences" });
    else if (dateOverdue(license.expiry_date, today)) warnings.push({ key: `lic-${license.id}-expiry`, message: `${name}: licence expired (${license.expiry_date.slice(0, 10)}).`, tab: "licences" });
  }
  return warnings;
}