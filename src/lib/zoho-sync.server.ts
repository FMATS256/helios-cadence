// Sync engine: pulls each Zoho Books entity and upserts into local mirror tables.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureOrganizationId, zohoPaginate, zohoGet } from "./zoho.server";

type Row = Record<string, unknown>;

async function logRun(entity: string, run: () => Promise<number>): Promise<{ entity: string; count: number; error?: string }> {
  const { data: log } = await supabaseAdmin
    .from("zoho_sync_logs")
    .insert({ entity, status: "running" })
    .select("id")
    .single();
  const logId = (log as { id: string } | null)?.id;
  try {
    const count = await run();
    if (logId) {
      await supabaseAdmin
        .from("zoho_sync_logs")
        .update({ status: "success", records_synced: count, finished_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return { entity, count };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) {
      await supabaseAdmin
        .from("zoho_sync_logs")
        .update({ status: "error", error: msg, finished_at: new Date().toISOString() })
        .eq("id", logId);
    }
    return { entity, count: 0, error: msg };
  }
}

async function upsert(table: string, rows: Row[]) {
  if (rows.length === 0) return 0;
  const chunk = 500;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + chunk), { onConflict: "zoho_id" });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
  return rows.length;
}

export async function syncCustomers() {
  const list = await zohoPaginate<Row>("/contacts", "contacts", { contact_type: "customer" });
  const rows = list.map((c) => ({
    zoho_id: String(c.contact_id),
    display_name: c.contact_name ?? null,
    company_name: c.company_name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    mobile: c.mobile ?? null,
    status: c.status ?? null,
    outstanding: Number(c.outstanding_receivable_amount ?? 0),
    unused_credits: Number(c.unused_credits_receivable_amount ?? 0),
    raw: c,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_customers", rows);
}

export async function syncVendors() {
  const list = await zohoPaginate<Row>("/contacts", "contacts", { contact_type: "vendor" });
  const rows = list.map((c) => ({
    zoho_id: String(c.contact_id),
    vendor_name: c.contact_name ?? null,
    company_name: c.company_name ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    status: c.status ?? null,
    outstanding_payable: Number(c.outstanding_payable_amount ?? 0),
    raw: c,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_vendors", rows);
}

export async function syncInvoices() {
  const list = await zohoPaginate<Row>("/invoices", "invoices");
  const rows = list.map((x) => ({
    zoho_id: String(x.invoice_id),
    invoice_number: x.invoice_number ?? null,
    customer_zoho_id: x.customer_id ? String(x.customer_id) : null,
    customer_name: x.customer_name ?? null,
    status: x.status ?? null,
    date: x.date ?? null,
    due_date: x.due_date ?? null,
    total: Number(x.total ?? 0),
    balance: Number(x.balance ?? 0),
    currency_code: x.currency_code ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_invoices", rows);
}

export async function syncSalesOrders() {
  const list = await zohoPaginate<Row>("/salesorders", "salesorders");
  const rows = list.map((x) => ({
    zoho_id: String(x.salesorder_id),
    salesorder_number: x.salesorder_number ?? null,
    customer_zoho_id: x.customer_id ? String(x.customer_id) : null,
    customer_name: x.customer_name ?? null,
    status: x.status ?? null,
    date: x.date ?? null,
    total: Number(x.total ?? 0),
    currency_code: x.currency_code ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_sales_orders", rows);
}

export async function syncEstimates() {
  const list = await zohoPaginate<Row>("/estimates", "estimates");
  const rows = list.map((x) => ({
    zoho_id: String(x.estimate_id),
    estimate_number: x.estimate_number ?? null,
    customer_zoho_id: x.customer_id ? String(x.customer_id) : null,
    customer_name: x.customer_name ?? null,
    status: x.status ?? null,
    date: x.date ?? null,
    expiry_date: x.expiry_date ?? null,
    total: Number(x.total ?? 0),
    currency_code: x.currency_code ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_estimates", rows);
}

export async function syncPayments() {
  const list = await zohoPaginate<Row>("/customerpayments", "customerpayments");
  const rows = list.map((x) => ({
    zoho_id: String(x.payment_id),
    payment_number: x.payment_number ?? null,
    customer_zoho_id: x.customer_id ? String(x.customer_id) : null,
    customer_name: x.customer_name ?? null,
    payment_mode: x.payment_mode ?? null,
    amount: Number(x.amount ?? 0),
    date: x.date ?? null,
    reference_number: x.reference_number ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_payments", rows);
}

export async function syncItems() {
  const list = await zohoPaginate<Row>("/items", "items");
  const rows = list.map((x) => ({
    zoho_id: String(x.item_id),
    name: x.name ?? null,
    sku: x.sku ?? null,
    rate: Number(x.rate ?? 0),
    unit: x.unit ?? null,
    status: x.status ?? null,
    description: x.description ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_items", rows);
}

export async function syncExpenses() {
  const list = await zohoPaginate<Row>("/expenses", "expenses");
  const rows = list.map((x) => ({
    zoho_id: String(x.expense_id),
    account_name: x.account_name ?? null,
    vendor_zoho_id: x.vendor_id ? String(x.vendor_id) : null,
    vendor_name: x.vendor_name ?? null,
    date: x.date ?? null,
    amount: Number(x.total ?? x.amount ?? 0),
    status: x.status ?? null,
    description: x.description ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_expenses", rows);
}

export async function syncCreditNotes() {
  const list = await zohoPaginate<Row>("/creditnotes", "creditnotes");
  const rows = list.map((x) => ({
    zoho_id: String(x.creditnote_id),
    creditnote_number: x.creditnote_number ?? null,
    customer_zoho_id: x.customer_id ? String(x.customer_id) : null,
    customer_name: x.customer_name ?? null,
    status: x.status ?? null,
    date: x.date ?? null,
    total: Number(x.total ?? 0),
    balance: Number(x.balance ?? 0),
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_credit_notes", rows);
}

export async function syncOrganizations() {
  const data = await zohoGet<{ organizations: Row[] }>("/organizations");
  const rows = (data.organizations ?? []).map((x) => ({
    zoho_id: String(x.organization_id),
    name: x.name ?? null,
    currency_code: x.currency_code ?? null,
    country: x.country ?? null,
    email: x.email ?? null,
    fiscal_year_start_month:
      typeof x.fiscal_year_start_month === "number" ? (x.fiscal_year_start_month as number) : null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_organizations", rows);
}

export async function syncTaxes() {
  const data = await zohoGet<{ taxes: Row[] }>("/settings/taxes");
  const rows = (data.taxes ?? []).map((x) => ({
    zoho_id: String(x.tax_id),
    tax_name: x.tax_name ?? null,
    tax_percentage: Number(x.tax_percentage ?? 0),
    tax_type: x.tax_type ?? null,
    raw: x,
    synced_at: new Date().toISOString(),
  }));
  return upsert("zoho_taxes", rows);
}

export type SyncResult = { entity: string; count: number; error?: string };

export async function syncAll(): Promise<SyncResult[]> {
  await ensureOrganizationId();
  const tasks: Array<[string, () => Promise<number>]> = [
    ["organizations", syncOrganizations],
    ["taxes", syncTaxes],
    ["items", syncItems],
    ["customers", syncCustomers],
    ["vendors", syncVendors],
    ["invoices", syncInvoices],
    ["sales_orders", syncSalesOrders],
    ["estimates", syncEstimates],
    ["payments", syncPayments],
    ["expenses", syncExpenses],
    ["credit_notes", syncCreditNotes],
  ];
  const results: SyncResult[] = [];
  for (const [name, fn] of tasks) {
    results.push(await logRun(name, fn));
  }
  return results;
}

export async function syncEntity(entity: string): Promise<SyncResult> {
  await ensureOrganizationId();
  const map: Record<string, () => Promise<number>> = {
    customers: syncCustomers,
    vendors: syncVendors,
    invoices: syncInvoices,
    sales_orders: syncSalesOrders,
    estimates: syncEstimates,
    payments: syncPayments,
    items: syncItems,
    expenses: syncExpenses,
    credit_notes: syncCreditNotes,
    organizations: syncOrganizations,
    taxes: syncTaxes,
  };
  const fn = map[entity];
  if (!fn) throw new Error(`Unknown entity: ${entity}`);
  return logRun(entity, fn);
}
