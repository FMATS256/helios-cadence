# IMT Cloud Client Portal

A new customer-facing self-service portal that lives alongside the existing IMT Account Manager. IMT staff continue to provision servers internally; customers get a branded workspace at a unique URL to manage the VPSs assigned to them — without ever seeing Kamatera/Vultr/Contabo.

## Architecture

```text
IMT Account Manager (staff)           IMT Cloud Client Portal (customers)
──────────────────────────            ─────────────────────────────────
/customers, /cloud, /cloud-ops   ->   /c/{company-slug}/{workspace-key}
provision via providers          ->   workspace auto-created on provision
                                      only sees abstracted "Server X"
                                      power/reboot/reinstall/console/etc.
                                      never sees provider names/IDs
```

Shared Supabase project — one identity, tenant-scoped RLS. Customers log in at `/c/login` (same `auth.users` table, different route + shell). IMT staff retain override access to every workspace.

## Data model (new migration)

- `cloud_workspaces` — one per customer. `id`, `customer_id` (FK), `slug` (company slug), `workspace_key` (short random, e.g. `8JX4PQ`), `branding` jsonb, `status`, timestamps. Unique (`slug`,`workspace_key`).
- `workspace_members` — `workspace_id`, `user_id`, `role` enum `workspace_role` (`owner` | `admin` | `developer` | `viewer`), `invited_by`, `invited_at`, `accepted_at`.
- `workspace_invitations` — pending email invites with token + expires_at.
- `workspace_servers` — links `cloud_servers.id` ↔ `workspace_id`, so a provisioned server appears in the correct workspace. Adds `display_name`, `customer_notes`.
- `workspace_audit_log` — every customer/IMT action on a workspace resource (who, what, resource, IP, UA).
- Extend `cloud_servers`: no schema changes needed; workspace link lives in `workspace_servers`.

RLS:
- Workspace members read/write their own workspace only.
- `has_role(auth.uid(),'master_admin')` OR any staff role bypasses tenant scoping (IMT override).
- `has_workspace_role(_user, _workspace, _min_role)` security-definer helper for policies.

## Auto-provisioning hook

Extend `finalizeProvisioning` (or the workflow completion path) to:
1. Ensure a `cloud_workspaces` row exists for the customer (create with slug=`slugify(company_name)`, `workspace_key`=6-char base32).
2. Insert into `workspace_servers` linking the new `cloud_servers.id`.
3. If no `owner` member exists, create one from the customer's primary contact email — send invitation email with link to `/c/{slug}/{key}?token=…`.
4. Record `workspace_audit_log` entry "server_provisioned".

## Routes

Customer portal (new subtree, public + gated inside):
- `src/routes/c.$slug.$workspaceKey.tsx` — layout: validates workspace, loads via `getWorkspaceContext` server fn, renders `CloudPortalShell` (IMT branded, customer company name in header, nav: Overview, Servers, Team, Billing, Support, Settings).
- `src/routes/c.$slug.$workspaceKey.index.tsx` — overview: server count, resource summary, recent activity.
- `src/routes/c.$slug.$workspaceKey.servers.tsx` — list of servers with status pill, IP, specs.
- `src/routes/c.$slug.$workspaceKey.servers.$serverId.tsx` — server detail: power actions, reinstall OS, reset root password, SSH keys, snapshots, backups, firewall, resource-usage charts, "Open console" button.
- `src/routes/c.$slug.$workspaceKey.team.tsx` — invite users, assign roles, revoke.
- `src/routes/c.$slug.$workspaceKey.billing.tsx` — invoices + subscriptions for their customer_id.
- `src/routes/c.$slug.$workspaceKey.support.tsx` — tickets scoped to workspace.
- `src/routes/c.login.tsx` — customer login (magic link + password).

Existing staff pages get:
- Workspace link/badge on each server in `/cloud-ops/*` and `/customers/$accountNumber`.
- "Impersonate workspace" button (staff-only) opening the portal in a new tab with a signed staff-override cookie.

## Server functions (`src/lib/portal.functions.ts`)

All `requireSupabaseAuth`; every one calls `assertWorkspaceAccess(userId, workspaceId, minRole)` that also allows master_admin/staff.

- `getWorkspaceContext({ slug, workspaceKey })` — returns workspace, customer, branding, my role.
- `listWorkspaceServers({ workspaceId })`
- `getWorkspaceServer({ workspaceId, serverId })` — merges local row with live provider info (via provider adapter, provider name still hidden from response).
- `serverPowerAction({ workspaceId, serverId, action })` — on/off/reboot; logs audit.
- `serverReinstall({ workspaceId, serverId, image })`
- `serverResetPassword({ workspaceId, serverId })` — generates new secure password, updates credential vault, returns one-time reveal.
- `serverSnapshotCreate/Restore/Delete`
- `serverFirewallList/Update`
- `serverConsoleUrl({ workspaceId, serverId })` — asks provider adapter for VNC/console URL, returns short-lived signed link.
- `inviteWorkspaceMember`, `acceptWorkspaceInvite`, `updateMemberRole`, `removeMember`.
- `listWorkspaceAuditLog`.

Provider adapters get new optional methods: `reinstall`, `resetPassword`, `snapshotCreate/Restore/Delete`, `firewallGet/Set`, `consoleUrl`. Kamatera + Vultr implemented; Contabo left as stub returning "not supported yet".

## Security

- All portal server fns run under RLS; the helper `has_workspace_role` gates access.
- Two-factor: opt-in TOTP via existing Supabase MFA hooks on customer login.
- Every state-changing call writes to `workspace_audit_log` (actor_kind = `customer` | `staff_override`).
- Rate limit power actions per server (max 6/min).
- Invitation tokens: 32-byte random, single use, 7-day expiry.

## UI

- New `CloudPortalShell` — IMT branded but shows customer company name + logo; navy sidebar, solar accents, same design tokens.
- Server detail page laid out as a hero with status pill + big action buttons (Power, Reboot, Reinstall, Console), tabbed sections: Overview, Networking (IPs, firewall), Storage (disks, snapshots), Access (SSH keys, root password reset), Backups, Activity.
- Uses existing `KpiCard`, `GradientAreaChart` for resource usage.

## Rollout in this change

1. Migration: workspaces, members, invitations, workspace_servers, audit log, `workspace_role` enum, `has_workspace_role`, grants + RLS.
2. `src/lib/portal.functions.ts` + adapter method extensions (Kamatera + Vultr).
3. Hook workspace creation into existing provisioning finalize step.
4. New routes under `src/routes/c.*.tsx` + `CloudPortalShell`.
5. Staff-side: link buttons to open workspace + impersonation.
6. Audit log viewer under staff Customers 360°.

## Out of scope for this change (follow-up)

- Full 2FA enforcement policy
- White-label per-customer branding editor (uses defaults; branding jsonb is stored)
- Billing self-serve payments (read-only for now)
- Migrating servers between workspaces
