/**
 * Records a gateway-confirmed portal payment as ACCOUNT CREDIT.
 *
 * The portal only posts money the gateway already confirmed, so we receipt it,
 * bank it into the chosen account and post the double entry — but the money is
 * deliberately NOT applied to any invoice. It sits on the customer's account as
 * credit until the account manager tells billing what it is for (a new invoice
 * or a specific service). Billing then applies it, which keeps the decision
 * with the people allowed to make it.
 */
import { recordAudit, recordCustomerEvent } from "./customer-events.server";

const n = (v: any) => Number(v || 0);
const round = (v: number) => Math.round(v * 100) / 100;

async function openInvoicesFor(db: any, customerId: string) {
  const [invR, allocR] = await Promise.all([
    db.from("invoices").select("id,invoice_number,total,currency,due_date,status")
      .eq("customer_id", customerId).is("archived_at", null)
      .not("status", "in", "(void,cancelled,draft)")
      .order("due_date", { ascending: true }),
    db.from("payment_allocations").select("invoice_id, amount"),
  ]);
  const paid: Record<string, number> = {};
  for (const a of allocR.data ?? []) {
    paid[a.invoice_id] = (paid[a.invoice_id] || 0) + n(a.amount);
  }
  return (invR.data ?? []).map((i: any) => ({
    ...i,
    balance: round(Math.max(0, n(i.total) - (paid[i.id] || 0))),
  })).filter((i: any) => i.balance > 0.005);
}

async function postToLedger(db: any, payment: any, account: any, customer: any) {
  try {
    const [{ latestRateMap, toBase }, { postJournalEntry, cashAccountCode }] = await Promise.all([
      import("@/lib/currency.shared"),
      import("./ledger.server"),
    ]);
    const { data: rateRows } = await db.from("exchange_rates")
      .select("currency, rate, effective_date")
      .order("effective_date", { ascending: false }).limit(400);
    const rates = latestRateMap((rateRows ?? []) as any);
    const currency = String(payment.currency || "USD").toUpperCase();
    const usd = round(toBase(payment.amount, currency, rates));
    if (usd <= 0.009) return;

    await postJournalEntry(db, {
      source_type: "payment",
      source_id: payment.id,
      source_ref: payment.receipt_number ?? payment.reference ?? null,
      entry_date: String(payment.paid_at).slice(0, 10),
      memo: `Portal payment held as account credit · ${customer.company_name ?? ""} · ${account.name}`.trim(),
      currency,
      fx_rate: rates[currency] ?? 1,
      customer_id: customer.id,
      lines: [
        {
          account_code: cashAccountCode(account.kind, payment.method),
          debit: usd, credit: 0,
          description: `Banked into ${account.name}`, customer_id: customer.id,
        },
        // Unapplied money is a liability to the customer, not settled revenue.
        { account_code: "2100", debit: 0, credit: usd, description: "Customer credit on account", customer_id: customer.id },
      ],
    }, null);
  } catch { /* ledger posting is best-effort; the receipt stands */ }
}

export type PortalRecordResult = {
  payment: any;
  receipt_number: string | null;
  account: { id: string; name: string; kind: string } | null;
  /** Money is parked on the account, not applied to invoices. */
  held_as_credit: number;
  credit_balance: number;
  open_invoices: Array<{ invoice_number: string; balance: number }>;
};

/** Tell the account manager (and billing) that credit is waiting for a decision. */
async function notifyCreditHeld(
  db: any,
  cust: { id: string; account_number: string; company_name?: string | null },
  amount: number,
  currency: string,
  receipt: string | null,
) {
  try {
    const [{ data: customerRow }, { data: staff }] = await Promise.all([
      db.from("customers").select("account_manager_id").eq("id", cust.id).maybeSingle(),
      db.from("user_roles").select("user_id")
        .in("role", ["finance", "operations_manager", "master_admin"] as any),
    ]);
    const ids = new Set<string>((staff ?? []).map((r: any) => r.user_id));
    if (customerRow?.account_manager_id) ids.add(customerRow.account_manager_id);
    if (!ids.size) return;
    await db.from("notifications").insert(
      Array.from(ids).map((id) => ({
        user_id: id,
        kind: "portal_credit",
        title: "Portal payment held as account credit",
        body: `${currency} ${amount.toFixed(2)} from ${cust.company_name ?? cust.account_number} (receipt ${receipt ?? "—"}) is on account. The account manager must tell billing whether to invoice it or apply it to a service.`,
        link: `/customers/${cust.account_number}`,
      })) as any,
    );
  } catch (e) {
    console.error("[notifyCreditHeld]", e);
  }
}

export async function recordPortalPayment(
  db: any,
  args: {
    submission: any;
    customer: { id: string; account_number: string; company_name?: string | null; primary_email?: string | null };
    account: any | null;
    externalId: string;
    gateway?: string | null;
  },
): Promise<PortalRecordResult> {
  const { submission: sub, customer: cust, account, externalId } = args;
  const amount = round(n(sub.amount));
  const currency = String(sub.currency || "USD").toUpperCase();

  const paidAtIso = new Date(`${String(sub.payment_date).slice(0, 10)}T12:00:00Z`).toISOString();

  // Receipt the money, but leave it unapplied: no invoice link, no allocation.
  const { data: payment, error: payErr } = await db.from("payments").insert({
    customer_id: cust.id,
    account_number: cust.account_number,
    amount,
    currency,
    method: sub.method || "mobile_money",
    reference: sub.reference || externalId,
    status: "received",
    paid_at: paidAtIso,
    notes: [sub.notes, "Held as account credit — awaiting billing instruction"].filter(Boolean).join(" · "),
    invoice_id: null,
    cash_account_id: account?.id ?? null,
  } as any).select("*").single();
  if (payErr) throw new Error(payErr.message);

  if (account?.id) {
    await db.from("cash_movements").insert({
      account_id: account.id,
      kind: "deposit",
      amount,
      currency,
      occurred_at: paidAtIso,
      payment_id: payment.id,
      reference: payment.receipt_number || payment.reference || null,
      notes: `Portal payment (account credit) · ${cust.company_name} (${cust.account_number})`,
    } as any);
    await postToLedger(db, payment, account, cust);
  }

  // The money now sits on the customer's account as credit.
  await db.from("customer_credits").insert({
    customer_id: cust.id,
    account_number: cust.account_number,
    amount,
    currency,
    kind: "advance",
    source_payment_id: payment.id,
    note: `Portal payment ${externalId} · receipt ${payment.receipt_number ?? "—"} · awaiting billing instruction`,
  } as any);

  const now = new Date().toISOString();
  await db.from("payment_submissions").update({
    status: "approved",
    reviewed_at: now,
    review_notes: `Gateway-confirmed by ${args.gateway || "the payments portal"} · receipted and held as account credit (not applied to any invoice)`,
    payment_id: payment.id,
    receipt_number: payment.receipt_number,
    cash_account_id: account?.id ?? null,
  } as any).eq("id", sub.id);

  await db.from("payment_submission_events").insert({
    submission_id: sub.id,
    action: "approved",
    notes: `Portal payment receipted as account credit · receipt ${payment.receipt_number ?? "—"}`,
  } as any);

  await recordCustomerEvent(db, {
    customer_id: cust.id,
    account_number: cust.account_number,
    event_type: "credit_added",
    title: `Portal payment held as credit: ${currency} ${amount.toFixed(2)}`,
    description: `Receipt ${payment.receipt_number ?? "—"} · on account until billing is told to invoice it or apply it to a service`,
    module: "billing",
    entity_type: "payment",
    entity_id: payment.id,
    new_value: {
      amount, currency, receipt_number: payment.receipt_number,
      external_id: externalId, account: account?.name ?? null, held_as_credit: amount,
    },
    major: true,
  });

  await recordAudit(db, {
    action: "payment.portal_credited",
    entity_type: "payment",
    entity_id: payment.id,
    account_number: cust.account_number,
    module: "billing",
    new_value: {
      amount, currency, receipt_number: payment.receipt_number,
      external_id: externalId, cash_account_id: account?.id ?? null, applied: false,
    },
  });

  await notifyCreditHeld(db, cust, amount, currency, payment.receipt_number ?? null);

  // Official receipt to the customer.
  if (cust.primary_email) {
    try {
      const { notify } = await import("./notify.server");
      await notify("receipt", cust.primary_email, {
        companyName: cust.company_name,
        receiptNumber: payment.receipt_number,
        amount: payment.amount,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        paidAt: String(payment.paid_at).slice(0, 10),
      }, `receipt-${payment.id}`);
    } catch { /* email failure must not roll back the payment */ }
  }

  let creditBalance = amount;
  try {
    const { data: credits } = await db.from("customer_credits").select("amount").eq("customer_id", cust.id);
    creditBalance = round((credits ?? []).reduce((s: number, c: any) => s + n(c.amount), 0));
  } catch { /* fall back to this payment's amount */ }

  const open = await openInvoicesFor(db, cust.id);

  return {
    payment,
    receipt_number: payment.receipt_number ?? null,
    account: account ? { id: account.id, name: account.name, kind: account.kind } : null,
    held_as_credit: amount,
    credit_balance: creditBalance,
    open_invoices: open.map((i: any) => ({ invoice_number: i.invoice_number, balance: i.balance })),
  };
}
