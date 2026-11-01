# Role-based access by department

## What is wrong today
- The staff menu only hides 3 admin pages; every other page is open to every staff member.
- The database lets any staff role read invoices, payments, ledgers, expenses, quotes, tickets and servers. Hiding a menu item alone would not stop a determined user.

## Access matrix (proposed)

Everyone on staff: Dashboard, Customers (basic info: name, account number, contacts, status, assigned manager, services list), Tickets (view/create), Knowledge Base, Notifications, own Inbox and Personal Assistant.

| Area | Finance | Account Managers / Sales | NOC / Tech / Cloud | Ops Manager / Master Admin |
|---|---|---|---|---|
| Customer 360 finance tab (invoices, statements, payments) | Full | Own clients, view only + request invoice | Hidden (shows "account in good standing / overdue" flag only) | Full |
| Finance workspace, Payments, Expenses & Cash, Ledger, Finance AI, Reports (financial) | Full | Hidden | Hidden | Full |
| Leads, Account Manager hub, Quotations, Communications | View | Own portfolio (full) | Hidden | Full |
| Projects | View | Own clients | Assigned work | Full |
| NOC Command, Field TechOps, Services (Cloud/VPS, Starlink, Hosting, Storage, VoIP) | Hidden | View service status for own clients | Full | Full |
| Credential Vault | Hidden | Hidden | Full (step-up + audit, unchanged) | Full |
| Inventory & POS, Procurement | Inventory: view, Procurement: full | POS + stock view | Inventory view/issue | Full |
| Packages / price catalogue | View (incl. cost) | Sell prices only | View | Full |
| Automation, Config, Email Studio, Permissions, Client Portal admin | Hidden | Hidden | Hidden | Master admin only |

Account managers see only clients where they are the assigned manager (plus clients shared with them by an admin). Finance and NOC see all clients' basic info.

## How it will work
1. One shared permission list (department → pages/actions) used by the menu, the page guards and the dashboard switcher, so all three always agree.
2. Menu shows only the sections a person's roles allow; opening a hidden page directly shows "Not available for your role" instead of the content.
3. Database rules tightened to match: finance tables readable by finance/billing staff and managers only (AMs limited to their own clients' invoices/payments); NOC/server/vault tables to technical roles; quotes/leads to sales roles, AMs limited to their portfolio. Client portal access stays as it is.
4. Customer 360 keeps its exact design; tabs a role can't use are hidden rather than empty.
5. Permissions page shows the matrix so administrators can see what each role gets.

## Not changing
- Approval rules (AMs request, Finance approves) and the vault's step-up checks.
- Client portal behaviour.

## Technical details
- Extend existing `can(roles, action)` helper into a central department policy map in `src/lib/permissions.ts`; drive `app-shell` nav, a `RoleGate` route wrapper, and Customer 360 tabs from it.
- Migration replacing broad `has_any_role(auth.uid())` SELECT policies on finance tables (invoices, payments, payment_allocations, journal_*, expenses, cash_*, refunds), technical tables (cloud_*, monitoring_*, server_*, ops_alerts) and sales tables (quotes, leads) with security-definer helpers: `is_finance_staff`, `is_tech_staff`, `is_sales_staff`, `manages_customer(uid, customer_id)`.
- Server functions using the admin client get matching role checks.
- Tests: one per rule (AM cannot read another manager's invoice, NOC cannot read journal entries, Finance cannot open vault).

## Decisions to confirm
- Should NOC see invoice/overdue status at all, or nothing financial?
- Should Account Managers see all clients' basic info, or only their own portfolio?
