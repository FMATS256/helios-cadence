# IMT Operations Platform — Feature Matrix (post Phase 3/4)

## Shipped

### Operations
- Global ⌘K command palette (customers / invoices / receipts / tickets / subs / assets / credentials)
- 360° Customer Workspace (`/customers/$accountNumber`) — Overview, Services, Subscriptions (one-click invoice), Invoices, Payments, Quotes, Tickets, Contacts, Credentials, Timeline, Notes
- Customers CRUD with immutable M-numbers, role-gated writes
- Support desk (tickets + messages, priorities, SLA)
- Credential Vault (AES-encrypted, access log)

### Services
- Cloud Ops (multi-provider: Kamatera, Vultr, Contabo) w/ modern wizard, live pricing, progress tracking
- Managed Services / Cloud subscriptions (auto-synced to Subscriptions)
- Starlink management (accounts, recharges w/ $77 external payout + margin, AURA scrape via Firecrawl)
- **Web Hosting** module (cPanel deep-links, renewal tracking)
- **Cloud Storage** module (Wasabi/B2 style, capacity)
- **Managed NAS** module (RAID, capacity, serial)
- Service Pages public marketing site (`/services/*`) w/ package pricing
- Assets + Laptop Tracking (TrackX integration)
- VoIP (Dandemutande crawl, recharges, balance)
- Monitoring (ping / http / port checks, incidents)
- Projects

### Business
- Payments Platform — KPI cards, universal search, filters, walk-in support, multi-invoice allocation, auto receipt numbers, reconciliation tracking, CSV export
- Auto invoice generation from subscriptions
- Quotes + Billing
- Subscriptions (auto-fetched from Cloud + services)
- **Licenses** — networking / cybersecurity / software with expiry countdown
- Inventory + low-stock alerts
- **Communications** log (email / SMS / WhatsApp / call notes)
- Reports (cross-module KPIs)

### System
- Master Admin (user roles, deactivation, secrets)
- Notifications, Knowledge Base, Settings
- Auth: email/password + Google OAuth, master admin bootstrap
- MCP server for AI-driven ops
- Portal for customers (invoices/tickets/assets)

### Phase 4 — Agent
- Provisioning workflow engine (validate → estimate → provision → install → monitor → notify)
- Auto retry cron (`/api/public/hooks/provisioning-retry`) w/ stall detection + max 3 retries
- Handover email w/ credentials
- Starlink AURA scraping (Firecrawl)

## Remaining / Nice-to-have

- Communications outbound sending (currently log-only — needs email/SMS provider wiring)
- Auto-suspend/reactivate rules with grace period settings (schema ready, worker pending)
- PDF invoice/receipt export (currently CSV only)
- Reports builder w/ custom filters + PDF export
- Cloud Storage / Managed NAS vendor API integrations (schemas ready, awaiting APIs)
- pg_cron schedule wiring for `provisioning-retry` and `reminders-tick` (manual today)
