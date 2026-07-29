## Scope note

This request is a multi-release program (three phases, ~40 distinct features, several external integrations: WHM/cPanel, Quote Studio, WhatsApp chatbot, PDF/Excel export). It cannot be delivered safely in one pass. Below is the delivery plan, ordered so each block ships working end-to-end with the current UI untouched.

I need one decision from you before starting: which block to build first (see "Start here" at the bottom).

---

## Block 1 — Customer 360 action bar + core workspaces

Adds new buttons beside the existing New Ticket / New Quote / Log Communication / Edit Details, using the existing colored `ActionBar` style. No layout change.

New actions and their dialogs/sheets:

- **Change Package** — fixes the duplicate-package bug: detects an existing active subscription for the same service type and *updates* it (status history row kept), instead of inserting a second. Recomputes recurring charge, writes timeline + audit entries.
- **Billing** — full-screen billing workspace sheet: outstanding, credit/advance balance, MRR/ARR, recurring charges, next invoice/renewal, last payment, invoice list with ageing buckets (0-30/31-60/61-90/90+), payment history with allocations, refunds, failed payments, billing alerts and notes. All read from one aggregated server function; auto-refetches on any billing mutation.
- **Customer Timeline** — major events only, with "View More" expanding to the full audit trail.
- **Communication Center** — threaded view of emails/notes already stored in `communications`, plus reply/compose. SMS/WhatsApp/call channels stubbed as disabled tabs (schema-ready).
- **Suspend / Resume / Cancel Service** — cascade rules across subscriptions, cloud services, hosting, VoIP, Starlink per service policy; timeline + audit.
- **Print Statement**, **Download Customer Profile (PDF + Excel)**, **Generate Contract**, **Refund**.
- **Customer Health badge** — Healthy / Attention Required / Critical, computed from overdue invoices, suspended services, open critical tickets, failed syncs, with reason list.

Also: every colored widget/chip on the page becomes clickable and scrolls to / opens the matching tab or workspace.

Backend: new tables for KYC documents, package history, refunds, and customer credit/wallet; new aggregate server functions; event helper that writes audit + timeline and invalidates the Customer 360 query key so every card refreshes without a page reload.

## Block 2 — KYC Documents + Equipment & Assets

- KYC action button with a document checklist driven by `customers.account_type` (corporate vs individual lists exactly as specified), upload to a private storage bucket, verification status per document.
- Equipment & Assets action button: assign/reassign equipment to the customer, serial, warranty, technician, assignment date, status, with full assignment history.

## Block 3 — Record Payment rework + real-time finance sync

- Replace the generic payment form with the service-driven workflow: customer → active/billable services dropdown → selected service loads package, status, outstanding, open invoice, due date, recurring charge → allocate to invoice / partial / advance / credit.
- On save: allocations, receipt generation, ledger, auto-resume of suspended services when billing rules are satisfied, timeline + audit, and cache invalidation so Customer 360, Billing, Finance, Invoices, Reports and Dashboard all update live.
- Fallback path when the customer has no services: setup fee, misc payment, deposit, customer credit.

## Block 4 — Support automation

- Ticket creation emails the customer (number, subject, description, priority, status, SLA, created date).
- Assignment notifies technician + customer; technician dashboard with Assigned / In Progress / Waiting Customer / Resolved / Overdue queues.

## Block 5 — Role-based visibility + audit hardening

- Hide supplier cost, profit, margin, wholesale price, API keys, WHM/server credentials from everyone except Super Admin and Finance — enforced server-side (columns stripped in the aggregator), not just hidden in the UI.
- Audit log records who / what / when / old value / new value / module / IP for every important mutation.

## Block 6 — Starlink recharge workflow

Status machine: Pending Finance → Paid → Message Sent → Awaiting Supplier → Completed / Failed / Cancelled, with the WhatsApp request to +263779237813, a scheduled job that re-checks supplier reply after ~1 hour, and notifications on both outcomes.

Needs from you: which WhatsApp provider account to use (Meta Cloud API, Twilio, or an existing gateway) — outbound messaging plus inbound reply capture requires a provider and webhook, which the platform does not have configured yet.

## Block 7 — Web Hosting (WHM) + Cloud Storage lifecycle

- WHM/cPanel API integration for create/suspend/unsuspend/terminate/change package/reset password/SSO/DNS/email/databases/backups/restore/usage sync, with auto-unsuspend on payment.
- Cloud storage provisioning lifecycle, capacity tracking, auto-suspend/resume on billing.

Needs from you: WHM hostname + API token, and the cloud storage platform's admin API details.

## Block 8 — Quote Studio integration

Replace local quote PDF generation with calls to the external Quote Studio API (`POST/GET/PUT/PATCH/DELETE /documents`, settings API), storing document ID + PDF, emailing the customer, and logging to timeline/documents.

Needs from you: Quote Studio base URL and API key (stored as a secret, never in code).

---

## Technical approach

- Aggregation stays in the existing `getCustomer360` server function — extended, not replaced — so the page keeps one round-trip and no N+1 queries.
- A shared `recordEvent` server helper writes `audit_log` + `customer_timeline` in the same transaction as each mutation, so "who/what/when/old/new" is never skipped.
- Real-time sync uses TanStack Query invalidation keyed per customer plus Supabase realtime on the mutated tables — no polling, no page refresh.
- All new actions run through authenticated server functions that validate role, ownership, and service state before executing.
- Existing UI primitives (`PageShell`, `StatChipRow`, `ActionBar`, `DataGrid`, dialogs) are reused as-is; no visual redesign anywhere.

## Start here

I recommend **Block 1** first — it is the highest-value slice and everything else hangs off its event/audit plumbing. Tell me to go, or name a different block to start with.

&nbsp;

Complete Block 1 only before starting any other block.

&nbsp;

Keep the existing Customer 360 layout and ActionBar. Do not redesign the UI.

&nbsp;

Add these Action Buttons:

- Change Package

- Billing

- Customer Timeline

- Communication Center

- KYC Documents

- Equipment & Assets

- Suspend Service

- Resume Service

- Cancel Service

- Generate Contract

- Refund

- Print Statement

- Download Customer Profile (PDF & Excel)

&nbsp;

Billing must open a backend-connected Billing Workspace displaying:

- Outstanding Balance

- Credit Balance

- Advance Payments

- Customer Credits/Wallet

- MRR & ARR

- Recurring Charges

- Next Invoice & Payment Due

- Last Payment

- Invoice History

- Payment History

- Payment Allocations

- Paid, Partially Paid, Unpaid & Overdue Invoices

- Invoice Ageing

- Refund History

- Failed Payments

- Billing Alerts

- Finance Notes

- Service Billing Status

- Upcoming Renewals

&nbsp;

Customer Timeline must display major events with a "View More" option for the complete audit history.

&nbsp;

Communication Center must support email conversations now and prepare the database for SMS, WhatsApp and Call Logs.

&nbsp;

KYC must automatically switch document requirements:

- Corporate: Certificate of Incorporation, CR14, Proof of Business Address, VAT Certificate, Tax Clearance, TIN, Signed Contracts, Proof of Payments and Other Documents.

- Individual: National ID/Passport and Proof of Residence.

&nbsp;

Equipment & Assets must support assignment, reassignment, serial numbers, warranty, technician assignment and full assignment history.

&nbsp;

Implement Customer Health (Healthy, Attention Required, Critical) based on overdue invoices, suspended services, critical tickets and failed integrations.

&nbsp;

Make every dashboard KPI widget clickable and open the relevant filtered records.

&nbsp;

Fix the Change Package bug. If an active package exists for the same service, update it instead of creating another active package. Preserve package history and automatically update billing.

&nbsp;

Create a shared server-side event framework. Every action must write to Customer Timeline and Audit Log within the same transaction.

&nbsp;

Use event-driven real-time synchronization so Customer 360, Billing, Finance, Invoices, Reports and Dashboards refresh automatically after every mutation without page reload.

&nbsp;

Extend existing backend functions instead of replacing them. Preserve existing APIs, maintain backward compatibility, avoid duplicate queries and enforce role-based permissions.

&nbsp;

Do not use placeholders or mock data. Every feature in Block 1 must be fully functional, connected to the backend, tested and production-ready before proceeding to Block 2.