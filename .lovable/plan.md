## RoyEno Solartech CRM — Frontend Scaffold (Phase 1)

A premium, desktop-first CRM UI shell for RoyEno Solartech. All 17 modules will exist as navigable pages with realistic mock data and polished components. No backend/auth in this phase — pure frontend so we can iterate on look, flow, and structure first. I switched your preview to desktop view (you can change it back via the device button above the preview).

### Design system

- **Theme**: Deep navy `#041B46` primary, vibrant orange `#F97316` accent, soft `#f5f7fb` surface — applied via semantic tokens in `src/styles.css` (oklch). No hard-coded colors in components.
- **Typography**: Inter for body, Space Grotesk for headings/numerics — gives a futuristic SaaS feel distinct from generic dashboards.
- **Components**: shadcn/ui (Card, Table, Tabs, Dialog, Sheet, Badge, Avatar, Progress, Sidebar) themed to match.
- **Layout**: Fixed collapsible sidebar (288px) + sticky top header with global search, "+ New" menu, notifications bell, user chip. Desktop-optimized (min 1280px), gracefully degrades to tablet.

### Information architecture (17 modules)

```text
/                          Dashboard (KPIs, pipeline snapshot, tasks, revenue chart)
/leads                     Leads list + kanban toggle, lead detail drawer
/clients                   Client database (table + filters), profile pages
/clients/$id               Full client profile (contact, GPS, system, warranty, docs, history)
/contacts                  Contact directory (people across clients/vendors)
/pipeline                  Sales pipeline kanban (drag-style cards, stage totals)
/quotes                    Quotes list + builder
/proposals                 Proposals list + template preview
/installations             Installation jobs board (calendar + list views)
/installations/$id         Job detail (technician, checklist, photos, sign-off)
/products                  Solar systems catalog (panels, inverters, batteries, kits)
/tasks                     Tasks & activities (my tasks, team tasks, filters)
/calendar                  Unified calendar (installs, site visits, follow-ups)
/documents                 Document library (contracts, datasheets, warranties)
/invoices                  Invoice list + detail
/payments                  Payment ledger + reconciliation view
/reports                   Reports & analytics (revenue, conversion, technician KPIs)
/marketing                 Campaigns, lead sources, WhatsApp/email broadcast stubs
/notifications             Notification center
/settings                  Org, users, roles, integrations, branding
```

### Reusable building blocks

- `AppShell` (sidebar + header + outlet) wired in `__root.tsx` via `SidebarProvider`.
- `KpiCard`, `SectionHeader`, `DataTable` (sortable, filterable wrapper around shadcn Table), `KanbanBoard`, `StatusBadge`, `EmptyState`, `PageHeader`, `DetailDrawer`.
- `mockData/` directory with realistic Zimbabwe-context seed data (Harare, Mutare, Nyanga clients; kW system sizes; USD pricing) so every page feels alive.
- One reusable revenue/sparkline chart via `recharts` already shipped with shadcn.

### Phase 1 deliverable per module

Each module page ships with:
1. Page header (title, breadcrumbs, primary CTA).
2. Filter/search bar.
3. Primary view (table, kanban, calendar, or grid) populated with mock data.
4. Detail dialog/drawer for at least one entity per module.
5. Empty + loading states.

Heavy logic (forms that mutate, real scheduling, payment math) is stubbed with toasts ("Saved — backend coming soon") so flows are clickable end-to-end.

### What's explicitly deferred to later phases

- Lovable Cloud / database / persistence
- Authentication, user profiles, RBAC, role-specific dashboards
- Real file uploads, GPS picker, document storage
- 3CX, WhatsApp, solar monitoring, AI analytics integrations
- Mobile-optimized layouts (desktop-first now)
- Email/SMS sending, real invoices/PDF generation

### Technical notes

- File-based routing under `src/routes/` (flat dot convention, e.g. `clients.$id.tsx`).
- Each route defines its own `head()` with title + description for SEO hygiene.
- All colors via tokens; new tokens added to `src/styles.css` (`--navy`, `--navy-foreground`, `--solar-orange`, gradients, elegant shadow).
- Sidebar uses shadcn `Sidebar` with `collapsible="icon"` and active-route highlighting via `useRouterState`.
- Mock data centralized in `src/mock/` so swapping to real APIs later is a single seam.

### Out of scope confirmation

You picked "Frontend only", "Everything at once (UI scaffolds + DB schema later)", "Email/password only — roles later", and asked for a desktop-sized, polished look. This plan delivers the polished desktop UI shell across all modules now; auth + Lovable Cloud schema land in Phase 2 once you're happy with the IA and visuals.
