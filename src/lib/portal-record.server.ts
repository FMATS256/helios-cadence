/**
 * Records a gateway-confirmed portal payment end to end.
 *
 * The IMT Payments Portal only posts money the gateway already confirmed, so
 * there is nothing left for billing to verify: we issue the official receipt,
 * apply it to the customer's open invoices (oldest first), bank it into the
 * chosen account, post the double entry to the general ledger and write the
 * Customer 360 timeline + audit trail. Billing still sees the payment in the
 * submissions list, already marked approved with its receipt number.
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
      memo: `Portal payment received · ${customer.company_name ?? ""} · ${account.name}`.trim(),
      currency,
      fx_rate: rates[currency] ?? 1,
      customer_id: customer.id,
      lines: [
        {
          account_code: cashAccountCode(account.kind, payment.method),
          debit: usd, credit: 0,
          description: `Banked into ${account.name}`, customer_id: customer.id,
        },
        { account_code: "1100", debit: 0, credit: usd, description: "Receivable settled", customer_id: customer.id },
      ],
    }, null);
  } catch { /* ledger posting is best-effort; the receipt stands */ }
}

export type PortalRecordResult = {
  payment: any;
  receipt_number: string | null;
  account: { id: string; name: string; kind: string } | null;
  allocations: Array<{ invoice_id: string; invoice_number?: string; amount: number }>;
};

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

  // Oldest-first allocation, with the targeted invoice taking priority.
  const open = await openInvoicesFor(db, cust.id);
  const target = sub.invoice_id;
  const ordered = target ? [...open.filter((i: any) => i.id === target), ...open.filter((i: any) => i.id !== target)] : open;
  const plan: Array<{ invoice_id: string; invoice_number?: string; amount: number }> = [];
  let left = amount;
  for (const inv of ordered as any[]) {
    if (left <= 0.005) break;
    const take = round(Math.min(left, inv.balance));
    if (take > 0.005) {
      plan.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, amount: take });
      left = round(left - take);
    }
  }

  const paidAtIso = new Date(`${String(sub.payment_date).slice(0, 10)}T12:00:00Z`).toISOString();

  const { data: payment, error: payErr } = await db.from("payments").insert({
    customer_id: cust.id,
    account_number: cust.account_number,
    amount,
    currency,
    method: sub.method || "mobile_money",
    reference: sub.reference || externalId,
    status: "received",
    paid_at: paidAtIso,
    notes: sub.notes || null,
    invoice_id: plan.length === 1 ? plan[0].invoice_id : sub.invoice_id,
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
      notes: `Portal payment · ${cust.company_name} (${cust.account_number})`,
    } as any);
    await postToLedger(db, payment, account, cust);
  }

  if (plan.length) {
    await db.from("payment_allocations").insert(
      plan.map((a) => ({ payment_id: payment.id, invoice_id: a.invoice_id, amount: a.amount })) as any,
    );
  }

  // Nothing outstanding any more → release suspended services.
  let resumed: any = {};
  try {
    const stillOpen = await openInvoicesFor(db, cust.id);
    if (!stillOpen.length) {
      const { resumeSuspendedForCustomer } = await import("./customer360.server");
      resumed = (await resumeSuspendedForCustomer(db, cust.id)) ?? {};
    }
  } catch { /* best-effort */ }

  const now = new Date().toISOString();
  await db.from("payment_submissions").update({
    status: "approved",
    reviewed_at: now,
    review_notes: `Auto-recorded: payment confirmed by ${args.gateway || "the payments portal"} gateway`,
    payment_id: payment.id,
    receipt_number: payment.receipt_number,
    cash_account_id: account?.id ?? null,
  } as any).eq("id", sub.id);

  await db.from("payment_submission_events").insert({
    submission_id: sub.id,
    action: "approved",
    notes: `Gateway-confirmed portal payment auto-recorded · receipt ${payment.receipt_number ?? "—"}`,
  } as any);

  await recordCustomerEvent(db, {
    customer_id: cust.id,
    account_number: cust.account_number,
    event_type: "payment_recorded",
    title: `Portal payment received: ${currency} ${amount.toFixed(2)}`,
    description: `Receipt ${payment.receipt_number ?? "—"}${plan.length ? ` · applied to ${plan.map((p) => p.invoice_number).join(", ")}` : " · held on account"}`,
    module: "billing",
    entity_type: "payment",
    entity_id: payment.id,
    new_value: {
      amount, currency, receipt_number: payment.receipt_number,
      external_id: externalId, allocations: plan, account: account?.name ?? null, resumed,
    },
    major: true,
  });

  await recordAudit(db, {
    action: "payment.portal_recorded",
    entity_type: "payment",
    entity_id: payment.id,
    account_number: cust.account_number,
    module: "billing",
    new_value: {
      amount, currency, receipt_number: payment.receipt_number,
      external_id: externalId, allocations: plan, cash_account_id: account?.id ?? null,
    },
  });

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

  return {
    payment,
    receipt_number: payment.receipt_number ?? null,
    account: account ? { id: account.id, name: account.name, kind: account.kind } : null,
    allocations: plan,
  };
}
