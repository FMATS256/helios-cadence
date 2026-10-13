// Server-only helper: post a single balanced journal entry to the general ledger.
// Idempotent on (source_type, source_id) so re-running postLedger never duplicates.

type Line = {
  account_code: string;
  debit: number;
  credit: number;
  description?: string | null;
  customer_id?: string | null;
  vendor_id?: string | null;
};

export type JournalDraft = {
  source_type: string;
  source_id: string;
  source_ref?: string | null;
  entry_date: string;
  memo: string;
  currency?: string | null;
  fx_rate?: number | null;
  customer_id?: string | null;
  lines: Line[];
};

const r2 = (n: number) => Math.round(Number(n || 0) * 100) / 100;

/** Cash/bank account code for a cash account kind or a payment method. */
export function cashAccountCode(kind?: string | null, method?: string | null): string {
  const k = String(kind || "").toLowerCase();
  if (k === "cash") return "1000";
  if (k) return "1010";
  return String(method || "").toLowerCase().includes("cash") ? "1000" : "1010";
}

/**
 * Post one journal entry. Returns the entry id, or null when an entry for the
 * same source document already exists (nothing is written in that case).
 * Never throws: a ledger hiccup must not roll back the business action.
 */
export async function postJournalEntry(
  db: any,
  draft: JournalDraft,
  userId?: string | null,
): Promise<string | null> {
  try {
    const { data: existing } = await db
      .from("journal_entries")
      .select("id")
      .eq("source_type", draft.source_type)
      .eq("source_id", draft.source_id)
      .maybeSingle();
    if (existing?.id) return null;

    const lines = draft.lines.filter((l) => r2(l.debit) > 0 || r2(l.credit) > 0);
    if (!lines.length) return null;

    const totalDebit = r2(lines.reduce((s, l) => s + Number(l.debit || 0), 0));
    const totalCredit = r2(lines.reduce((s, l) => s + Number(l.credit || 0), 0));
    if (Math.abs(totalDebit - totalCredit) > 0.009) {
      await logLedgerFailure(db, draft, `Unbalanced entry: debit ${totalDebit} vs credit ${totalCredit}`, userId);
      return null;
    }

    const { data: accounts } = await db.from("chart_of_accounts").select("id, code");
    const idByCode = new Map((accounts ?? []).map((a: any) => [a.code, a.id]));

    const { data: entry, error } = await db
      .from("journal_entries")
      .insert({
        entry_date: String(draft.entry_date).slice(0, 10),
        memo: draft.memo.slice(0, 300),
        source_type: draft.source_type,
        source_id: draft.source_id,
        source_ref: draft.source_ref ?? null,
        currency: draft.currency || "USD",
        fx_rate: draft.fx_rate ?? 1,
        customer_id: draft.customer_id ?? null,
        total_debit: totalDebit,
        total_credit: totalCredit,
        created_by: userId ?? null,
      } as any)
      .select("id")
      .single();
    if (error || !entry?.id) {
      await logLedgerFailure(db, draft, error?.message ?? "Journal entry insert failed", userId);
      return null;
    }

    const { error: lineErr } = await db.from("journal_lines").insert(
      lines.map((l) => ({
        entry_id: entry.id,
        account_code: l.account_code,
        account_id: idByCode.get(l.account_code) ?? null,
        debit: r2(l.debit),
        credit: r2(l.credit),
        description: l.description ?? null,
        customer_id: l.customer_id ?? null,
        vendor_id: l.vendor_id ?? null,
      })) as any,
    );
    if (lineErr) {
      await db.from("journal_entries").delete().eq("id", entry.id);
      await logLedgerFailure(db, draft, lineErr.message, userId);
      return null;
    }
    return entry.id as string;
  } catch (e: any) {
    await logLedgerFailure(db, draft, e?.message ?? String(e), userId);
    return null;
  }
}

/** Record an unposted ledger entry in the audit log so Finance can see and retry it. */
async function logLedgerFailure(db: any, draft: JournalDraft, reason: string, userId?: string | null) {
  try {
    console.error("[ledger] post failed", draft.source_type, draft.source_id, reason);
    await db.from("audit_log").insert({
      actor_id: userId ?? null,
      action: "ledger_post_failed",
      entity_type: draft.source_type,
      entity_id: draft.source_id,
      new_value: { reason: reason.slice(0, 500), draft },
    });
  } catch {
    /* never throw from failure logging */
  }
}
