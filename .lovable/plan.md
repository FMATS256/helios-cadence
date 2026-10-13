# Finance workspace review and improvement plan

This is a read-only review. No files or records were changed. Findings are marked **Confirmed** (seen in code) or **Needs live test**.

## Key findings

### 1. Navigation and layout
- **Confirmed:** Invoices open from three places: `/billing` only redirects to `/finance?tab=invoices`, and `/payments?tab=invoices` shows a separate Billing workspace. This makes it unclear where the invoice list really lives.
- **Confirmed:** The Payments tabs are passed with a type cast (`tabs={TABS as any}`), so a wrong tab setting would not be caught before release.
- **Needs live test:** The 8-column export and payments tables may scroll sideways or crowd on phones.

### 2. Totals, currency and dates
- **Confirmed (high):** The Finance overview (`finance.tsx` ~149–230) and the Finance dashboard (`finance-dashboard.tsx` 20–34) add up USD, ZAR and ZWG amounts as if they were the same currency. Revenue, MRR, AR, collected-this-month and cash-flow figures are wrong whenever more than one currency is in use. The Accounting, Money and portal code already converts with the saved exchange rates, so these two screens are the odd ones out.
- **Confirmed:** "Today", this month and this year are worked out from the computer's local clock. Payments made near midnight can fall into the wrong month.
- **Confirmed (high):** The Billing workspace loads payment allocations with no row limit (`billing.functions.ts:91`). The database returns at most 1,000 rows by default and drops the rest without warning, so once there are more than 1,000 allocations, "paid" amounts would show too low and balances too high.
- **Confirmed:** Other screens load fixed batches of 2,000–20,000 rows into the browser. This will get slower as data grows, and totals will be cut short once those limits are reached.
- **Confirmed:** Overdue payables are always shown as 0 (`finance.tsx:221`). The number is a placeholder, not a calculation.

### 3. Missing finance workflows
- **Confirmed missing:** Bank reconciliation. There is a reconciliation status field, but no screen to match bank lines to payments.
- **Confirmed missing:** Supplier bills and money owed to suppliers. Expenses skip the bill → approve → pay steps, and there is no supplier aging report.
- **Confirmed missing:** Month-end close or lock date. Entries can still be posted into months that should be closed.
- **Needs check:** Whether invoice tax is posted to its own tax account; there is no VAT return report.
- **Needs check:** Whether there is a proper credit note against an invoice, separate from account credits and refunds.

### 4. Approvals and audit
- **Confirmed good:** Billing, Accounting and Money actions check the user's role on the server before running.
- **Confirmed (high):** The ledger helper swallows every error and returns nothing (`ledger.server.ts:40–102`). If posting fails, the payment still goes through, but the ledger silently drifts with no alert.
- **Confirmed (high):** Steps that must succeed or fail together are saved one by one. Portal payments save the payment, the cash movement, the ledger entry, the credit and the audit record as separate writes. If one step fails partway, records end up half-saved.
- **Confirmed:** Creating an invoice saves the invoice before its line items, and does not remove it if the line items fail. This can leave invoices with no lines.
- **Needs live test:** The portal payment API relies on one fixed key, with no signature check or replay window.

### 5. Data integrity
- **Confirmed good:** Portal payments block repeats by their outside ID, and ledger entries block repeats by their source document.
- **Needs check:** If two identical portal payment requests arrive at the same moment, both may get through unless the database enforces one row per outside ID.
- **Confirmed:** Type casts on database calls are used widely, so a renamed or removed column will not be caught before release.

## Improvement plan (in order)

1. **Correct totals:** Convert amounts to USD with the saved exchange rates on the Finance overview and dashboard, and show the base currency on each total.
2. **Stop silent truncation:** Add explicit limits or paging to the allocation load, and move dashboard totals to the server instead of loading whole tables into the browser.
3. **Make money postings all-or-nothing:** Save payment approval, portal payment and invoice creation as single database operations, so each one either fully succeeds or fully rolls back.
4. **Surface ledger failures:** Have ledger posting report its errors, record failures in an "unposted entries" list, and give Finance a retry button.
5. **Fix dates:** Use one business timezone (Africa/Harare) for today/month/year boundaries and for saved dates.
6. **One invoices home:** Make `/finance?tab=invoices` the only invoice list and point the other links there.
7. **Real overdue payables:** Calculate them from purchase orders and expenses, or hide the tile until supplier bills exist.
8. **New workflows, one at a time:** bank reconciliation matching, then supplier bills with aging, then month-end close/lock, then VAT reporting and credit notes.
9. **Hardening:** Add a database rule allowing only one portal payment per outside ID, a signed portal API with a replay window, and fewer type casts on finance code.
10. **Live checks:** Test Finance on phones and with mixed-currency sample data, then clean up the test data.

## Technical details
- Reuse `latestRateMap`/`toBase` from `src/lib/currency.shared.ts`.
- Use database functions (rpc) to save multi-step postings together.
- Each step is checked with a typecheck, a signed-in preview of Finance, and a matching trial balance before moving on.
