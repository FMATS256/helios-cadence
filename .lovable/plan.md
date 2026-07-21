# Customer 360 Workspace – Unification & Enhancement Plan

Enhancement-only. Preserves every existing module, permission, integration, and route. No rebuilds, no design overhaul.

## Current state (verified)

- **Two customer profile routes exist** — a duplicate the spec forbids:
  - `/customers/$accountNumber` — 979-line master C360 with 16 tabs (Overview, Services, Services Mgmt, Packages, Subscriptions, Invoices, Payments, Quotes, Assets, Tickets, Renewals, Contacts, Credentials, Communications, Timeline, Notes).
  - `/finance/customers/$accountNumber` — 1064-line finance-focused profile with Zoho-style tabs (Overview, Comments, Transactions, Mails, Statement, Contact Persons, Payment Methods, Invoices, Payments, Subscriptions, Quotes) and finance actions (Edit details, Suspend/Resume, Send reminder, Create Invoice, Record Payment).
- **Link audit:** 20 modules deep-link into `/customers/$accountNumber`; only `src/routes/finance.tsx` (2 places) links into `/finance/customers/$accountNumber`.
- **Global search (`src/components/global-search.tsx`, ⌘K):** already searches customers, invoices, payments, tickets, subscriptions, assets, credentials via `globalSearch` server fn. No recents, no keyboard scoping, no domain/IP/serial/username fields.

## Strategy

1. **Merge** the finance profile's unique capabilities into the main `/customers/$accountNumber` — no second profile page.
2. **Redirect** `/finance/customers/$accountNumber` → `/customers/$accountNumber?tab=transactions` so existing finance-module links keep working with no duplicate UI.
3. **Add** the modules the spec lists that don't exist yet as new tabs on the single profile.
4. **Enhance** global search with recents and more indexed fields.
5. Everything else the spec lists already exists and stays as-is (services mgmt filtering, package assignment, contacts, comments, statement CSV, payment-method history, lifecycle actions, RBAC, email notifications, etc.).

## Changes

### 1. Single Customer 360 (`src/routes/customers.$accountNumber.tsx`)

Merge in from the finance profile:

- **Sticky header additions:** Available Credit, Last Payment date, Next Renewal, Service Health pill (compute from existing subs), Assigned Account Manager. MRR/Outstanding/Customer-Since already present.
- **Top-level customer actions row:** Edit Details dialog, Suspend/Resume all services toggle, Send Reminder, Quick Create Invoice, Quick Record Payment — wire to the existing `updateCustomerRecord`, `setCustomerLifecycle`, `sendPaymentReminder`, `QuickCreateInvoice`, `QuickRecordPayment` already in `src/lib/ops.functions.ts` and the finance route.
- **New tabs (kept alongside existing 16):**
  - `Transactions` — merged invoice+payment chronological feed (lift from finance route).
  - `Statement` — full statement view with CSV export (lift from finance route).
  - `Payment Methods` — grouped payment-method history + preferred method (lift from finance route).
  - `Devices` — filtered `assets` view where category = device (computer/router/switch/firewall/UPS/printer/TrackX).
  - `Cloud Resources` — read `cloud_servers`, `cloud_services`, `cloud_storage_accounts`, `managed_nas_accounts`, `web_hosting_accounts`, `voip_accounts`, `starlink_accounts`, `licenses` filtered by `customer_id`. Read-only listing, groups by type.
  - `Domains / Hosting / M365` — subset view of `web_hosting_accounts` + `licenses` where type = M365, with domain column surfaced. Prepared for future API integrations (no new API work).
  - `Documents` — list + upload from a new `customer_documents` table (see §3). Preview/download/version fields.
  - `Audit Log` — read-only view of `audit_log` filtered by this customer.
- **Notes:** split existing Notes tab tabs into Sales / Finance / Technical / Management sub-tabs (uses existing `customer_notes.category` field if present, otherwise a new `category` column — see §3).
- **Persistent Quick Actions rail** (right-side sticky panel): Add Service, Create Invoice, Record Payment, Generate Quote, Open Ticket, Assign Device, Suspend/Resume, Renew, Upload Document, Send Email, View Statement. Each button opens the existing dialog or scrolls to the relevant tab — no new workflows.
- **URL tab sync:** support `?tab=<name>` so redirects from finance and other modules can land on a specific tab.

### 2. Redirect legacy finance profile (`src/routes/finance.customers.$accountNumber.tsx`)

Replace the 1064-line page with a thin route that renders `<Navigate to="/customers/$accountNumber" params search={{ tab: "transactions" }} replace />`. Update the 2 links in `src/routes/finance.tsx` to point directly at `/customers/$accountNumber?tab=transactions`. All other 20+ modules already point at the correct URL.

### 3. Global search upgrade (`src/components/global-search.tsx` + `globalSearch` in `src/lib/ops.functions.ts`)

- **Recents & frequents:** localStorage-backed list of last 10 opened customers, shown when the palette is empty.
- **Extra indexed fields on the server fn:** domain (from `web_hosting_accounts`), IP/VPS name (from `cloud_servers`), serial (from `assets.serial_number`), username (from `credentials.username`). Add to existing SQL `.or()` filters; keep RLS.
- **Keyboard nav & fuzzy** are already handled by `cmdk` — no change needed; add group headings for the new fields.
- All results continue to open `/customers/$accountNumber` (invoice/ticket/asset drilldowns keep their current deep links).

### 4. Minor schema additions (single migration)

- `customer_documents` table: `id, customer_id, name, category, file_url, uploaded_by, version, created_at, updated_at` + RLS + GRANTs (authenticated read/write scoped by role, service_role all).
- `customer_notes.category` column (if not already present) — enum-like text with values `sales | finance | technical | management`. Default `sales`.
- Storage bucket `customer-documents` (private) for uploads.

No changes to auth, existing tables' shape, or existing policies.

## Out of scope (already done, preserved as-is)

RBAC matrix, service catalog, package assignment, subscription lifecycle actions, invoice/receipt auto-numbering, email templates & studio, dashboards, VoIP/Starlink/TrackX integrations, provisioning agent, backups/budgets, communications timeline, contacts CRUD.

## Technical notes

- Merge is a **copy of components**, not a rewrite — the finance profile's `TransactionsView`, `StatementTable`, `PaymentMethodsView`, `QuickCreateInvoice`, `QuickRecordPayment` are lifted into `src/routes/customers.$accountNumber.tsx` (or a shared `src/components/customer/` folder) and re-used.
- All new tabs are lazy — data queries `enabled` only when the tab is active, so the profile keeps its current load speed.
- No changes to `src/routeTree.gen.ts` (generated) or `src/integrations/supabase/*` (managed).
- Final file structure: **one** customer profile route, **one** finance redirect, **one** enhanced search palette, **one** migration.

Approve to switch to build mode and implement.

&nbsp;

Implementation Note (Critical)

&nbsp;

Before implementing any change, inspect the existing codebase and reuse or enhance existing components, pages, routes, queries, and workflows wherever possible. Do not duplicate functionality or create alternative customer profile pages.

&nbsp;

The Customer 360 Workspace must be the single source of truth for every customer. Any customer selected from the Dashboard, Global Search, Customers, Finance, Invoices, Payments, Quotes, Services, Subscriptions, Assets, Devices, Tickets, Reports, or any other module must always open the same Customer 360 Workspace.

&nbsp;

If a feature already exists, polish and extend it instead of rebuilding it. Only create new components, tabs, database objects, or workflows where functionality is genuinely missing. Maintain backward compatibility, preserve all existing business logic, permissions, APIs, integrations, and routes, and ensure all customer data stays synchronized across the platform.