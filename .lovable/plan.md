# Technical Operations Workspace

A phased build of a full Technical Operations platform inside IMT Account Manager. Existing design system, auth, RBAC, audit log and backend integrations are reused — nothing in Customer 360, Finance or the current NOC/monitoring stack is redesigned or replaced.

## Navigation

A new **Technical Operations** sidebar group. Existing pages move under it rather than being duplicated:

```text
Technical Operations
  Technician Dashboard      (new)
  Installations & Jobs      (upgrade of Work Orders)
  Equipment & Allocations   (new, backed by inventory + assets)
  Monitoring & Alerts       (existing Monitoring, extended)
  NOC Command Centre        (existing)
  Servers                   (existing Cloud Ops)
  Hosting                   (existing WHM/cPanel module)
  Cloud & Storage           (existing)
  Starlink / VoIP / Network Tools (existing + new calculators)
  Credential Vault          (existing, hardened)
  System Health             (existing diagnostics, extended)
  SOC                       (Phase 3)
```

---

## Phase 1 — Technical Operations core

### Technician Dashboard
A role-aware home for technical staff showing only live data: jobs assigned to me, unassigned jobs in my queue, critical monitoring alerts, services/servers needing attention, installations scheduled in the next 7 days, equipment currently allocated to me, open incidents, failed provisioning and failed provider-sync jobs, and a system health strip. Managers see the team-wide view; technicians see their own.

### Installations & Jobs
Work Orders is upgraded into a full job lifecycle:

```text
Job -> Customer -> Site -> Requirements -> Technician -> Equipment
    -> Installation -> Testing -> Sign-off -> Completion report
```

Per job: site address and GPS pin (reuses the Service Map geocoder), scheduled window, assigned technicians, a requirements list, a generated checklist, equipment allocation, site photos, recorded configuration and IP/network details, installation notes, customer signature capture, and an auto-generated completion report emailed to the customer through the existing template pipeline.

**Requirements to equipment plan**: an engineer enters requirements (e.g. 6 APs, 2 switches, firewall, structured cabling, Starlink backup). The system turns that into an allocation plan, checks stock in Inventory, flags shortfalls, and reserves items against the job. On completion, allocated hardware is deducted from stock and registered as customer assets.

### Equipment & Allocations
A single view of what is reserved, issued, installed, returned or lost, per technician and per job, driven by existing inventory and asset records.

### Monitoring & Alerts
Existing checks stay. Added: alert generation rules for offline services, high CPU/RAM, low disk, backup failure, API/integration failure, provisioning failure and storage capacity, each with a severity level, and the workflow acknowledge → assign → investigate → resolve with a full alert timeline.

---

## Phase 2 — Service operations and vault hardening

- **Servers**: provisioning, OS/IP assignment, power actions, live CPU/RAM/storage/uptime, snapshots and backups, recorded configuration, installed software, lifecycle status and a complete per-server history feed. Built on the existing Kamatera/Contabo/Vultr adapters.
- **Hosting**: extends the existing WHM integration with package changes, DNS, email accounts, databases, SSL, backups/restores, disk and bandwidth usage, plus automatic provisioning once a payment marks the related invoice paid.
- **Cloud & Storage**: provisioning, resource allocation, user/permission management, usage monitoring, backups, suspend/resume, renewals and capacity alerts.
- **VoIP**: SIP account creation, extensions, number assignment, package management, balance and usage, status changes, troubleshooting actions and monitoring.
- **Starlink**: kit register, activation and status, customer assignment, installation details, connectivity diagnostics and recharge status — wired to the existing Starlink workflow.
- **Network Tools**: adds IP/subnet calculator, public IP lookup, DNS propagation across resolvers and MAC/vendor lookup to the diagnostics toolkit already shipped (ping/HTTP, DNS, port, WHOIS, blacklist, mail health).
- **Credential Vault hardening**: reveal requires an emailed one-time code plus a stated reason; every reveal, change and rotation is recorded in access and version history; rotation reminders; permissions enforced server-side; credentials never surface in Customer 360 for unauthorized roles.

---

## Phase 3 — SOC and Cybersecurity Services

**Data sources**: real internal signals (failed authentications, suspicious logins, monitoring outages, backup and provisioning failures, credential access anomalies, audit-log events), analyst-entered findings from external tools, and an EDR/antivirus connector. No fabricated security data anywhere.

**SOC workspace**: Security Dashboard, Clients, Alerts, Incidents, Devices, Vulnerabilities, Reports.

Incident workflow: `Alert -> Investigation -> Incident -> Assignment -> Containment -> Resolution -> Report`, tracking client, severity, affected device, source, detection time, analyst, notes, evidence, actions taken, resolution and a full timeline. Dashboard metrics: critical incidents, high-risk clients, active threats, offline endpoints, unresolved alerts, open vulnerabilities, security events, incidents today/this month and mean time to respond.

**Cybersecurity Services** surface on Customer 360 as a security section per customer: endpoint protection/EDR, antivirus, firewall, network security, vulnerability assessments, security monitoring, email security, backup monitoring, awareness training, penetration testing, incident response, audits and reports — with real status pulled from the connector where one exists, and service-record status where it does not.

---

## Customer 360 integration

No layout redesign. The existing workspace tabs gain technical panes that appear only when the customer has relevant data: Infrastructure, Devices, Installations, Security, Monitoring. Existing Services, Credentials, Tickets and Billing panes are untouched.

## Cross-cutting rules

Every action runs through an authenticated server function, validates RBAC and record ownership, writes an audit log entry, adds a customer timeline entry where relevant, refreshes affected data without a page reload, and never returns restricted credentials or security detail to unauthorized roles.

## Technical notes

- New tables (with grants, RLS and role-scoped policies): installation jobs and job steps, job requirements, job equipment allocations, job photos and sign-offs, alert rules and alerts, server config/software/history entries, credential step-up challenges, SOC alerts, incidents, incident events, endpoints, vulnerabilities and security service records.
- Server logic lives in `createServerFn` modules under `src/lib`, with provider calls in `.server.ts` helpers; scheduled evaluation runs through the existing `/api/public/hooks/*` cron endpoints.
- All screens use the `enterprise.tsx` primitives (PageShell, StatChipRow, ActionBar, DataGrid) so the look matches Customer 360 exactly.
- The EDR connector needs API credentials for your tenant; tell me the vendor (Bitdefender GravityZone, SentinelOne, ESET, Sophos, other) when we reach Phase 3 and I will request the keys then.

## Deliverable for this approval

Phase 1 in full — Technician Dashboard, Installations & Jobs with the requirements-to-equipment planner, Equipment & Allocations, the alerting workflow, and the new Technical Operations navigation group. Phases 2 and 3 follow as separate releases.
