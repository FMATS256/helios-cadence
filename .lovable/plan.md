
## IMT Operations Platform — Phase 1

Reuse the existing visual language (navy + solar-orange tokens, Inter/Space Grotesk, AppShell, sidebar, CrudTable, PageHeader, StatusPill). Drop the solar CRM tables. Build the foundation, Credential Vault, and Support Tickets in this phase; everything else from the spec becomes "Coming soon" placeholder pages so the sidebar reflects the full IMT module map from day one.

### Scope of Phase 1

**Foundation (full functionality)**
- Customer Accounts with auto-generated `M0001`-style numbers (immutable, non-reusable, globally searchable)
- Users, Roles, RBAC (Master Admin, Ops Mgr, Finance, Sales, Account Mgr, Tech Support, Cloud Eng, Cyber Sec, NOC, Inventory, Procurement, Customer Success, Read-Only, Custom)
- Master Administrator dashboard
- Global search across customers, tickets, credentials, assets, invoices
- Append-only audit log (user, IP, action, old/new value) — visible to Master Admin
- Soft-delete + restore everywhere
- MFA-ready auth scaffolding (email/password + Google), session timeout, account lockout

**Credential Vault (full functionality)**
- Encrypted credential store (envelope encryption — see Technical section)
- Credential types: Server, NAS, Router, Firewall, Switch, WiFi, SSH key, API key, VPN, DB, Microsoft, Email, Cloud, Licence, Recovery, Certificate, Private/Public key
- Per-credential: linked customer, linked device/asset, owner, expiry, version history, access log, permission control
- Every reveal logged

**Support Tickets (full functionality)**
- Create from customer, sales, AM, engineer
- Assign to team / engineer, priority, SLA timer, status workflow
- Internal notes vs customer replies, attachments, resolution notes
- Escalation rules (priority + SLA breach)
- Linked to customer timeline

**Stubbed modules (sidebar + placeholder page only)**
Cloud Services, Assets, Monitoring, Billing (Quotes/Invoices/Payments/Statements/Subscriptions), Projects, Inventory, Reports, Notifications, Knowledge Base, Settings sub-pages. Each shows a "Coming in Phase 2" panel so the IA is complete and the platform feels whole.

### Information architecture

```text
/                         Master dashboard (KPIs, alerts, recent tickets, system health)
/customers                Customer directory (M-numbers, global view)
/customers/$accountNumber Customer 360 (profile, contacts, services, tickets, credentials, assets, invoices, timeline)
/tickets                  Support desk (list + board)
/tickets/$id              Ticket detail
/credentials              Credential vault (filterable by customer/type)
/cloud                    [stub] Cloud Services
/assets                   [stub] Asset Management
/monitoring               [stub] Monitoring & alerts
/billing                  [stub] Billing hub (sub-tabs: quotes, invoices, payments, subs)
/projects                 [stub] Projects
/inventory                [stub] Inventory & warehouse
/reports                  [stub] Reports
/notifications            Notification center (real, basic)
/admin                    Master Admin (users, roles, audit log, system settings, impersonation, backups)
/settings                 Personal settings + MFA
/auth                     Sign in / sign up
```

### Existing solar pages

Dropped. Routes deleted: leads, clients, contacts, pipeline, quotes, proposals, installations, products, tasks, calendar, documents, invoices, payments, marketing, Zoho sync pages. Existing tables dropped via migration. Existing Zoho integration code archived (kept in repo, removed from sidebar) so we can revisit if needed.

### Technical section

**Stack:** existing TanStack Start + Lovable Cloud (Supabase). All app-internal logic via `createServerFn`; webhooks/external under `/api/public/*`.

**Schema (Phase 1 tables):**
- `customers` — id, `account_number` (text, unique, auto from sequence `M%04d`), company, status, industry, tags, assigned_account_manager, soft-delete columns
- `customer_contacts`, `customer_branches`, `customer_documents`, `customer_notes`, `customer_timeline`
- `app_roles` enum + `user_roles` table (separate from profiles, per security rules) + `permissions` + `role_permissions` for custom roles
- `profiles` (extended), `user_sessions`, `failed_logins`
- `tickets`, `ticket_messages`, `ticket_attachments`, `ticket_sla_rules`
- `credentials` (encrypted ciphertext + iv + key_id), `credential_versions`, `credential_access_log`
- `audit_log` (append-only, trigger-driven)
- `notifications`
- `system_settings`

**Customer numbering:** Postgres sequence + `BEFORE INSERT` trigger generating `M` + `lpad(nextval, 4, '0')`. Column is immutable (trigger blocks UPDATE).

**RBAC:** `has_role(uuid, app_role)` and `has_permission(uuid, text)` SECURITY DEFINER functions used in every RLS policy. No role data on profiles.

**Credential encryption:** AES-256-GCM in a server function. DEK per credential, wrapped by a KEK stored as a Lovable Cloud secret (`CREDENTIAL_MASTER_KEY` — generated via `generate_secret`, 64 chars). Plaintext never stored, never logged, never returned except through an explicit "reveal" server fn that writes to `credential_access_log` first.

**Audit log:** Generic Postgres trigger on tracked tables writing `(actor, action, table, row_id, old, new, ip, user_agent)` into `audit_log`. IP/UA passed via `set_config('app.request_ip', ...)` from a request middleware.

**Soft delete:** `deleted_at timestamptz` on every domain table; RLS policies filter it out by default; Master Admin can query archived.

**Global search:** Postgres `tsvector` columns + `gin` indexes on customers, tickets, credentials (metadata only — never ciphertext), assets. One `search` server fn returns grouped results.

**Auth:** Supabase email/password + Google (configured this turn). MFA via Supabase TOTP enrollment in `/settings`. Session timeout enforced client-side via existing auth hook + server-side via short-lived JWT refresh policy.

**RLS:** Every table RLS-enabled, every public table gets explicit GRANTs in the same migration. Policies use `has_role` / `has_permission`. `service_role` always granted for admin server fns.

**UI reuse:** Keep `AppShell`, `Sidebar`, `PageContainer`, `PageHeader`, `StatusPill`, `CrudTable`, color tokens, gradients. New sidebar groups: Operations / Customers / Services / Admin. No new colors, no new fonts.

### What this turn delivers

1. Migration: drop old tables; create new schema; seed roles; create sequence + triggers; RLS + grants.
2. Configure Google OAuth provider.
3. Generate `CREDENTIAL_MASTER_KEY` secret.
4. New sidebar + route files (real for foundation/vault/tickets, stub for the rest).
5. Server functions for customers CRUD, tickets CRUD, credentials CRUD + reveal, global search, admin user mgmt, audit log read.
6. Master Admin dashboard.
7. Update `__root.tsx` head metadata + tour copy to "IMT Operations Platform".

Phase 2 candidates (not built now): Cloud provisioning, Asset/Monitoring agents, full Billing engine, Projects, Inventory, Reports, Knowledge Base, WhatsApp/SMS integration, customer portal, mobile.
