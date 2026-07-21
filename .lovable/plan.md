# Finance Workspace — single-page consolidation

Merge the current split finance pages (`/billing`, `/payments`, `/quotes`, `/subscriptions`, `/reports`, plus receivables/payables/banking/procurement/inventory/assets/ledger views) into one enterprise workspace at `/finance`. Existing IMT branding, shadcn components, and design tokens stay unchanged — only layout, composition, and navigation change.

## Scope

- Presentation and composition only. No new database tables, no new business logic, no changes to existing server functions or RLS. Reuse current queries and server fns already used by the individual pages.
- Modules not yet backed by tables (Suppliers, Purchase Orders, Bank Accounts, Journal Entries, Tax) render as **empty-state panels** inside their tab with a "Not yet connected" note, so the workspace shell is complete but doesn't fabricate data. Wiring real data for those is out of scope for this pass and can be a follow-up.
- Old routes (`/billing`, `/payments`, `/quotes`, `/subscriptions`, `/reports`) stay in place as **redirects to `/finance?tab=...**` so existing links, emails, and deep-links keep working. Menu entries collapse into a single **Finance** item.

## Route + shell

New file: `src/routes/finance.tsx`

- Uses existing `PageContainer`, `HeroPanel`-style header, and dashboards/shared primitives (`KpiCard`, `SectionCard`, `QuickAction`).
- URL-driven state via `validateSearch` (`@tanstack/zod-adapter` + `fallback`):
  - `tab` (overview | customers | suppliers | invoices | payments | subscriptions | products | revenue | expenses | procurement | inventory | assets | banking | ledger | journals | reports | tax | audit | settings)
  - `q` (universal search)
  - `customerId` (opens the Customer Financial Panel drawer)
  - `from`, `to` (date range), `currency`, `period`
- Tab switching updates search params only — one route, no navigation.

## Header strip

Sticky top bar inside the workspace:

- Company selector (single-tenant today → shows "IMT Solutions" static; component present for future multi-entity).
- Financial period + date range (`from`/`to`) — presets: Today, MTD, QTD, YTD, Last 12m, Custom.
- Currency selector (USD / ZWL / GBP display toggle — display-only conversion using existing values, no FX table).
- Universal Finance Search input (see below).
- Quick Actions dropdown: Create Invoice, Record Payment, Create Customer, Add Product, Add Subscription, Create Purchase Order (disabled), Record Expense (disabled), Add Supplier (disabled), Journal Entry (disabled). Each opens the existing dialog/route as a modal where one already exists; disabled ones show a tooltip "Coming soon".
- Notifications bell reusing the existing `notifications` query.

## KPI band

Grid of `KpiCard`s driven by one aggregate query (extends the current `loadFinance` in `src/components/dashboards/finance-dashboard.tsx`). Each card is clickable and sets `tab` + a canned filter in search params.

Cards: Today's Revenue, MTD Revenue, YTD Revenue, MRR, ARR, Cash Available*, Bank Balance*, AR, AP*, Outstanding Invoices, Paid Invoices, Draft Invoices, Customer Credits*, Deposits*, Outstanding Customer Balances, Outstanding Supplier Balances*, Monthly Expenses*, Gross Profit*, Net Profit*, Profit Margin*, Inventory Value, Asset Value, Tax Payable*, Tax Receivable*, Deferred Revenue*, Active Customers, Active Subscriptions, Total Products.

Cards marked `*` render with a "—" placeholder + subtle "connect data" hint when their source table isn't wired yet, so the grid is complete without inventing numbers.

## Universal Finance Search

- Debounced input in the header.
- Reuses the existing `global-search` command palette logic (`src/components/global-search.tsx`) but rendered inline as a results dropdown scoped to finance entities: customers, invoices, payments, receipts, subscriptions, quotes, products (service_catalog), assets, cloud services (Starlink / VoIP / VPS / hosting / NAS accounts by identifier).
- Selecting a result either sets `customerId` (customers) or opens the relevant drawer/tab pre-filtered.

## Customer Financial Panel

Right-side `Sheet` drawer, opens when `customerId` is set. Reuses queries already used by `src/routes/customers.$accountNumber.tsx` — no new server fns. Sections: summary, balances, credits/deposits (placeholder where missing), revenue & profit (from invoices/payments), active services, subscriptions, invoices, payments, statement, ledger, recent activity, upcoming renewals. All read-only inside the drawer; "Open full 360" button links to the existing customer route.

## Tabs

All rendered inside the same route via a `<Tabs>` component keyed off `tab` search param.

- **Overview** — KPI band + Financial Activity Feed + AR/AP summary + top renewals.
- **Customers** — table (reuses `customers` list); row-click opens Customer Financial Panel drawer.
- **Suppliers** — empty-state placeholder.
- **Invoices** — extracts existing `/billing` table + create dialog.
- **Payments** — extracts existing `/payments` platform UI.
- **Subscriptions** — existing `/subscriptions` UI.
- **Products** — existing `service_catalog` UI from `/catalog`, read-only inside finance.
- **Revenue** — charts from existing invoices/payments/subscriptions data: recurring vs one-time, by category (service_catalog category), by product, by customer, trend, top customers, top products.
- **Expenses / Procurement / Inventory / Assets / Banking / Ledger / Journals / Tax** — shell panels with the described sub-sections as empty states (Assets/Inventory reuse existing `assets` + `inventory_items` queries where available).
- **Reports** — server-rendered PDF/CSV/Excel export buttons for Balance Sheet, P&L, Cash Flow, Trial Balance, GL, Customer/Supplier Statements, Revenue, Expenses, Tax. In this pass: wire CSV export for reports whose data already exists (Customer Statements, Revenue, AR aging); others show "Data source not connected".
- **Audit Logs** — table over existing `audit_log` filtered to finance-relevant tables (invoices, payments, subscriptions, quotes, customers).
- **Settings** — currency/period defaults, saved to `system_settings`.

## Financial Activity Feed

Single feed on Overview + filterable full view on Activity section. Sourced from existing tables via `union`-style client-side merge: recent rows from `invoices`, `payments`, `subscriptions`, `customers`, `quotes`, `cloud_servers`, `cloud_services`, `starlink_recharges`, `voip_recharges`, `assets`. Each event has icon + label + link that sets the appropriate tab/drawer. Refetched every 30s via `useQuery` `refetchInterval`; realtime upgrade (postgres_changes) is a follow-up.

## Accounts Receivable / Payable sections

Rendered inside Overview and Customers/Suppliers tabs:

- AR: aging buckets (0-30/31-60/61-90/90+) computed from `invoices.due_date`, statements link, credits (placeholder), collections list = overdue invoices.
- AP: empty-state until suppliers/bills exist.

## Menu + redirects

- `src/components/app-shell.tsx`: replace Billing/Payments/Quotes/Subscriptions/Reports items with a single **Finance** item pointing to `/finance`.
- Convert `src/routes/billing.tsx`, `payments.tsx`, `quotes.tsx`, `subscriptions.tsx`, `reports.tsx` into thin redirect routes (`throw redirect({ to: "/finance", search: { tab: "invoices" } })` etc.) so bookmarks/emails still land in the workspace.
- `/invoices/$id` stays as-is (invoice detail view is a valid deep-link).
- Portal routes (`/portal/invoices`, `/c/...`) are untouched.

## Head metadata

`src/routes/finance.tsx` gets a dedicated `head()`: title "Finance Workspace — IMT Operations", finance-specific description, og:title/description, twitter:card. Redirect stubs don't need metadata.

## Technical notes

- All data reads reuse existing server functions and Supabase queries; no schema migrations.
- Heavy tab bodies are code-split with `React.lazy` and wrapped in `Suspense` so the initial workspace payload stays light.
- Every KPI/section respects the header's `from`/`to`/`currency` filters via a shared `useFinanceFilters()` hook that reads the route search.
- Currency selector applies display formatting only; underlying `amount`/`currency` fields are unchanged.
- Tests: type-check + a manual pass on `/finance` (tab switching, KPI click-through, customer drawer, universal search, quick action modals, CSV export on Revenue).

## Out of scope (call out to user)

- Suppliers, Purchase Orders, Bank Accounts, Journal Entries, Tax, Expenses tables — schema + CRUD.
- Real-time postgres_changes wiring for the activity feed.
- Multi-entity / multi-company data model.
- FX rate tables for real currency conversion.

These are natural follow-ups once the shell is approved.

&nbsp;

Finance Workspace Revision

&nbsp;

Do NOT merge all finance functionality into a single page.

&nbsp;

Do NOT remove or replace the existing finance pages.

&nbsp;

Keep all existing pages, routes, components, and functionality exactly as they are.

&nbsp;

Examples:

&nbsp;

- Billing

- Payments

- Quotes

- Subscriptions

- Reports

- Products

- Revenue

- Banking

- Inventory

- Assets

- Customers

- Any other existing finance-related pages

&nbsp;

These pages must remain fully functional and continue to be accessible through direct URLs and deep links.

&nbsp;

---

&nbsp;

Build a Finance Workspace Instead

&nbsp;

Create a new Finance Workspace at "/finance".

&nbsp;

This page becomes the landing page for the Finance module.

&nbsp;

Think of it as the home dashboard of an enterprise accounting system like Zoho Books or QuickBooks.

&nbsp;

It provides a complete financial overview but does not replace the underlying modules.

&nbsp;

---

&nbsp;

Navigation

&nbsp;

The left navigation should contain a single Finance menu item.

&nbsp;

Opening Finance displays the Finance Workspace.

&nbsp;

Within the workspace, users can navigate to:

&nbsp;

- Dashboard

- Customers

- Suppliers

- Products & Services

- Quotations

- Sales Orders

- Invoices

- Payments

- Customer Credits

- Subscriptions

- Revenue

- Banking

- Accounts Receivable

- Accounts Payable

- General Ledger

- Journal Entries

- Expenses

- Procurement

- Inventory

- Assets

- Tax

- Financial Reports

- Audit Logs

- Settings

&nbsp;

Each section should open its existing page or module.

&nbsp;

Do not embed every module into one page.

&nbsp;

---

&nbsp;

Finance Dashboard

&nbsp;

The dashboard should display executive financial information using KPI cards.

&nbsp;

Examples:

&nbsp;

- Today's Revenue

- Monthly Revenue

- Annual Revenue

- Monthly Recurring Revenue

- Annual Recurring Revenue

- Cash Available

- Bank Balance

- Accounts Receivable

- Accounts Payable

- Outstanding Invoices

- Paid Invoices

- Draft Invoices

- Customer Credits

- Deposits

- Outstanding Customer Balances

- Outstanding Supplier Balances

- Monthly Expenses

- Gross Profit

- Net Profit

- Profit Margin

- Inventory Value

- Asset Value

- Tax Payable

- Tax Receivable

- Deferred Revenue

- Active Customers

- Active Subscriptions

- Total Products

&nbsp;

Each KPI card should be clickable and open the relevant existing module.

&nbsp;

---

&nbsp;

Universal Finance Search

&nbsp;

The Finance Workspace must include a global search that searches across every finance module.

&nbsp;

Users should be able to search by:

&nbsp;

- Customer

- Account Number

- Invoice Number

- Payment

- Subscription

- Product

- Supplier

- Purchase Order

- Quote

- Journal Entry

- Bank Transaction

- Asset

- VPS

- Domain

- Microsoft Tenant

- Starlink Account

- Fibre Service

- Email

- Phone Number

&nbsp;

Selecting a result opens the appropriate existing page or record.

&nbsp;

---

&nbsp;

Quick Actions

&nbsp;

Provide quick actions without replacing existing workflows.

&nbsp;

Examples:

&nbsp;

- Create Invoice

- Record Payment

- Create Customer

- Add Product

- Create Quote

- Create Subscription

- Record Expense

- Create Purchase Order

- Add Supplier

- Create Journal Entry

&nbsp;

These should launch the existing dialogs or pages already used by the system.

&nbsp;

---

&nbsp;

Financial Activity Feed

&nbsp;

Display a live financial activity timeline on the dashboard.

&nbsp;

Examples:

&nbsp;

- Invoice Created

- Payment Recorded

- Subscription Renewed

- Customer Registered

- Purchase Order Approved

- Expense Recorded

- Supplier Paid

- Credit Applied

- Refund Issued

- VPS Provisioned

- Microsoft License Purchased

- Starlink Activated

&nbsp;

Selecting an activity opens the relevant existing module.

&nbsp;

---

&nbsp;

Customer Financial Panel

&nbsp;

When a customer is selected, show a financial summary panel with:

&nbsp;

- Current Balance

- Outstanding Balance

- Available Credit

- Revenue Generated

- Profit Generated

- Active Services

- Active Subscriptions

- Invoices

- Payments

- Statement

- Customer Ledger

- Recent Activity

- Upcoming Renewals

&nbsp;

A button should open the customer's existing full profile.

&nbsp;

---

&nbsp;

Keep Existing Modules

&nbsp;

Do not merge, delete, or replace any finance modules.

&nbsp;

Each module should continue operating independently.

&nbsp;

The Finance Workspace simply provides a central dashboard that links to them and summarizes their information.

&nbsp;

This approach preserves scalability, keeps deep links intact, and provides an enterprise accounting experience similar to Zoho Books while allowing each financial area to remain a dedicated, fully featured module.