# Plan — four workstreams, shipped in order

## 1. In-place actions in Customer 360 (no more redirects)

On `/customers/$accountNumber`, replace the Quick Action buttons that currently navigate away with dialogs scoped to the current client. All writes go through existing authenticated server fns and invalidate the customer queries so every tab auto-syncs.

- **Add Service**: dialog pulls active catalog, choose package + qty + price, calls `assignServices({ customer_id, items })`. On success: Services + Subscriptions + Billing tabs refresh.
- **New Quote**: dialog with title, line items (pick from catalog), amount auto-calc, valid-until, status. Writes to `quotes` + `quote_line_items` with this `customer_id` prefilled and locked.
- **Record Payment**: single-step dialog — amount, method (cash/transfer/mobile-money/card/other), reference, optional invoice to allocate to (dropdown of unpaid invoices for this client), notes. Calls existing payment server fn, auto-allocates if invoice picked, triggers receipt email.
- **New Ticket**: dialog — subject, description, priority, assign technician (dropdown of staff with support role). Writes to `tickets` with `customer_id` locked; notifies assignee via existing trigger.
- **Log Communication**: dialog — channel (call/email/whatsapp/meeting), contact person (dropdown of `customer_contacts` for this client, defaults to primary), summary, follow-up date. Writes to `communications`.
- **Service detail drawer**: clicking a row in Services tab opens a drawer with lifecycle actions (upgrade/downgrade/suspend/resume/renew/cancel) instead of navigating to the module page.

New/updated server fns as needed (`createQuoteForCustomer`, `logCommunication`, `createTicketForCustomer`) — all `requireSupabaseAuth`, all scoped by passed `customer_id`.

## 2. Fixed guided onboarding

Rework `/customers/new`:

- **Step 0**: account type radio — **Corporate** or **Personal** (no default, user must choose). Corporate shows company name + industry + website; Personal shows full name only.
- **Step 1 (contact)**: mandatory for corporate (name + email + phone required to advance); optional for personal.
- **Step 2 (services)**: at least one service required to advance.
- **Step 3 (review)**: add **"Mark first invoice as paid"** toggle + payment method dropdown. On create, if selected services exist, auto-generate an initial invoice; if "paid" toggled, also record a payment allocated to it.
- Fix the current failure (will reproduce and patch the specific error surfaced).

## 3. Deploy with AI — human approval

Today `deployFromPrompt` picks + provisions in one shot. New flow:

- **Step A — Propose**: `proposeDeployment(prompt)` returns `{ provider, plan_id, region, os, label, monthly_cost, rationale }` using Lovable AI (`google/gemini-3.6-flash`) with the live plan/region/OS catalog as context. Provider choice is constrained to enabled ones (Vultr recommended, Kamatera/Contabo fallback).
- **Step B — Approve**: dialog shows the proposal + cost + rationale with **Approve & Deploy** / **Edit** / **Cancel**. Nothing is provisioned until Approve.
- **Step C — Provision**: on approve, existing `provisionServer` runs.
- Also write a short in-app explainer in the dialog: *"Runs on our backend using your provider API keys; you approve every deployment; provider is chosen by fit + cost."*

## 4. UI refresh on client pages

After 1–3 land, tighten Customer 360:

- Cleaner tab bar (group Overview / Services / Billing / Support / Assets / Cloud / Docs).
- Service rows become clickable cards → drawer (from #1).
- Consistent dialog styling; remove the outbound-link icons on action buttons.

## Technical notes

- All new mutations use `useServerFn` + `useMutation`, then `queryClient.invalidateQueries({ queryKey: ["customer-360", accountNumber] })` (existing pattern).
- No schema changes required for #1; #2 reuses existing `invoices`/`payments`; #3 adds one new server fn only.
- Each workstream is one turn; I'll pause after #1 for you to sanity-check before continuing.

Enhance the existing Customer 360 workspace into a complete customer operations workspace while preserving all existing modules, permissions, integrations, APIs, routes, data, authentication, audit logging, and functionality. This is an enhancement only, not a rebuild.

&nbsp;

Customer 360 must become the primary place where staff manage a customer. Users should rarely need to leave the customer page to complete day-to-day operations.

&nbsp;

Remove all navigation redirects from Customer 360 action buttons. Every action must execute in place using dialogs, drawers, or inline workflows while remaining on the current customer page.

&nbsp;

Remove the existing Quick Actions section and remove the "Quick Add Customer" action from Customer 360. Customer creation must only happen through the dedicated onboarding process.

&nbsp;

All actions must always be automatically scoped to the currently opened customer. Never ask the user to choose a customer once they are inside Customer 360. Every dialog, lookup, search, dropdown, mutation and query must only use records belonging to the currently selected customer.

&nbsp;

Implement the following customer-scoped operations:

&nbsp;

• Add Service

• Record Payment

• Create Invoice

• Create Quote

• Create Ticket

• Deploy Cloud Server

• Log Communication

• Add Contact

&nbsp;

Add Service must use the existing product/service catalog and assign services only to the current customer.

&nbsp;

Record Payment must only display unpaid invoices, services and subscriptions belonging to the current customer. It must support payment allocation, update invoice status, generate a receipt, trigger existing notifications and immediately refresh Customer 360.

&nbsp;

Create Invoice must only invoice services belonging to the current customer.

&nbsp;

Create Quote must automatically attach to the current customer and lock customer selection.

&nbsp;

Create Ticket must automatically attach to the current customer and notify the assigned technician using existing notification mechanisms.

&nbsp;

Log Communication must only display contacts belonging to the current customer.

&nbsp;

Deploy Cloud Server must automatically associate the deployed infrastructure with the current customer.

&nbsp;

Clicking a service must open a Service 360 management drawer instead of navigating away. The drawer must support lifecycle operations including upgrade, downgrade, suspend, resume, renew and cancel while displaying all available operational information already stored by the platform.

&nbsp;

Implement the correct service lifecycle.

&nbsp;

Services must NOT become Active immediately after being added.

&nbsp;

Required workflow:

&nbsp;

Customer Created

→ Add Service

→ Service Status = Pending Payment

→ Generate Invoice

→ Record Payment

→ Invoice Paid

→ Service Automatically Changes to Active

→ Provision Resources Automatically (where applicable)

→ Begin Recurring Billing

→ Refresh Customer Dashboard

&nbsp;

Only after successful payment should services activate.

&nbsp;

Every successful operation must automatically refresh Customer 360 using the existing query invalidation pattern so that dashboards, billing, services, subscriptions, activity history, revenue, balances, invoices, tickets and related widgets update immediately without requiring a page refresh.

&nbsp;

Rework customer onboarding.

&nbsp;

Step 0:

Require explicit selection of Corporate or Personal account.

&nbsp;

Step 1:

Corporate accounts require company information.

Personal accounts require personal information.

&nbsp;

Step 2:

Corporate accounts require at least one contact before continuing.

Personal contacts remain optional.

&nbsp;

Step 3:

Require at least one service before completion.

&nbsp;

Step 4:

Review.

&nbsp;

Automatically generate the first invoice for selected services.

&nbsp;

Provide an optional "Mark First Invoice as Paid" workflow.

&nbsp;

If selected:

• Record payment

• Allocate payment

• Mark invoice paid

• Generate receipt

• Activate services

• Refresh Customer 360 automatically

&nbsp;

Investigate and fix the current customer creation failure before implementing enhancements.

&nbsp;

Replace the current AI deployment flow with an approval workflow.

&nbsp;

New flow:

&nbsp;

User enters requirements

→ AI recommends provider, plan, region, operating system, estimated monthly cost and rationale using the live provider catalog

→ Display recommendation

→ User may Approve, Edit or Cancel

→ Only after approval may provisioning begin

&nbsp;

Provisioning must never occur before explicit user approval.

&nbsp;

Provider selection must only use enabled providers and continue using existing provider integrations and APIs.

&nbsp;

Maintain the existing backend security model.

&nbsp;

All new server functions must require authentication, perform authorization checks, enforce customer ownership and write audit logs.

&nbsp;

Reuse existing schema wherever possible.

&nbsp;

Continue using existing server functions, mutations, authentication, notifications, billing, payment allocation, invoicing and provisioning logic where available instead of duplicating functionality.

&nbsp;

Maintain compatibility with all existing APIs, modules, integrations and permissions.

&nbsp;

The final result should provide a complete end-to-end operational workflow:

&nbsp;

Create Customer

→ Add Service

→ Service Pending Payment

→ Generate Invoice

→ Record Payment

→ Activate Service

→ Provision Resources

→ Customer dashboard updates automatically

&nbsp;

No operation performed inside Customer 360 should ever expose, modify or reference another customer's data. Every action, search, dropdown, invoice, payment, service, quote, ticket, deployment and communication must always remain isolated to the currently selected customer.