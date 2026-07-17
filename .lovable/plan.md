# Why this needs phasing

You asked for ~15 major features in one go: universal search + 360° workspace, payments platform overhaul, auto invoices/receipts, auto suspend/reactivate, hosting/cloud-storage/NAS modules, licenses, reports, finish provisioning agent, communications, Starlink AURA scraping, etc.

Each one alone is a full turn. Bundling them guarantees:

- Half-working screens, broken RLS, and blank pages
- Wasted credits fixing regressions
- No verification per feature

I'll ship this in 4 tight phases. Each phase compiles, is verified, and unlocks the next.

---

## Phase 1 — Payments platform + auto invoice/receipt (this turn)

Upgrade the existing `/payments` page in place (no new page):

- Header KPI cards: Today, This Week, This Month, Outstanding, Pending Reconciliation, Failed, Credit Balances, Refunds
- Universal search input (account #, name, company, invoice #, receipt #, txn ref, phone, email, PPPoE)
- Quick date filters (Today, 7d, 30d, This Month, Last Month) + status/method filters
- Expanded table: receipt #, account, customer, company, method, amount, currency, txn ref, invoices paid, recorded by, date, reconciliation, service status, actions
- Record Payment dialog upgraded: pick any billable service (subscription/invoice/one-off), full/partial/multi-invoice, walk-in, advance credit
- On successful payment: auto-match to invoices, mark paid/partial, generate receipt row, log audit, mark subscription active
- Customer quick-view drawer on row click: services, balance, outstanding, recent tickets, devices
- CSV export

## Phase 2 — Universal Global Search + 360° Customer Workspace

- Global search bar in app shell (⌘K) that searches customers, invoices, payments, tickets, subscriptions, assets, credentials by account #, name, phone, email, invoice #, PPPoE, MAC, serial, etc.
- New `/workspace/$accountNumber` route with sticky header + tabs: Overview, Services, Payments, Invoices, Quotes, Tickets, Network, Devices, Documents, Communications, Timeline, Audit
- Quick actions bar: Record Payment, Generate Invoice, Suspend, Reactivate, Send Receipt, Add Note, Create Ticket

## Phase 3 — New modules + admin

- Web Hosting module (cPanel accounts, deep-links, renewal dates)
- Cloud Storage + Managed NAS modules (schema ready, awaiting your APIs)
- Networking & Cybersecurity license tracker (manual add + renewal reminders)
- Reports builder with CSV/PDF export
- Auto-suspend/reactivate rules with grace period settings

## Phase 4 — Finish provisioning agent + Starlink AURA scraping

- Agent worker: retry loop, status polling cron via `/api/public/hooks/*`, cloud-init hardening, failure alerts
- Starlink AURA scraping via Firecrawl for account/balance/usage using stored customer credentials
- Communications log (email/SMS/WhatsApp) per customer

---

## Technical notes

- All new tables get GRANT + RLS + owner policies in one migration
- Server functions use `requireSupabaseAuth`; public reads use publishable-key client with narrow anon SELECT
- KPI cards + charts reuse existing `dashboards/charts.tsx` primitives
- No new pages for payments — upgrade `src/routes/payments.tsx` in place, per your instruction
- Receipts: generated as an `invoices` row with `type = 'receipt'` OR a new `receipts` table (I'll pick receipts table for clean separation)

---

## What I need from you

**Confirm: start Phase 1 now?** Reply "yes phase 1" and I'll build it end-to-end this turn. Any other slice, tell me which phase to start with instead.

If you insist on everything at once, I'll do it — but expect broken screens and follow-up turns to repair each one. My strong recommendation is Phase 1 first.

&nbsp;

Yes phase 1