/**
 * Customer 360 — Service Capability Engine.
 *
 * Single source of truth for every service line the platform exposes on the
 * Customer 360 workspace. Each capability declares:
 *   - identity (key, label, icon, color, deep link)
 *   - a picker that extracts its items from the aggregated Customer 360 view
 *   - a metrics builder that produces live operational counters
 *   - dashboard defaults (whether it contributes a tab, whether it has data)
 *
 * The route consumes this registry to dynamically render KPIs, tabs, and
 * section cards. New provider integrations register a Capability here and
 * light up on Customer 360 with zero route changes.
 */
import {
  Cloud, Globe, Satellite, PhoneCall, HardDrive, Database, Server, Activity,
  Laptop, Package as PackageIcon, LifeBuoy, KeyRound, FileText, Boxes,
  ShieldAlert, Mail as MailIcon, FolderKanban,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Aggregated Customer 360 payload returned by getCustomer360. */
export type Customer360View = {
  customer: any;
  services: any[]; subscriptions: any[]; invoices: any[]; payments: any[];
  quotes: any[]; tickets: any[]; assets: any[]; credentials: any[];
  timeline: any[]; packages: any[];
  contacts: any[]; branches: any[]; notes: any[]; communications: any[];
  cloudServers: any[]; monitoringChecks: any[]; monitoringIncidents: any[];
  webHosting: any[]; starlink: any[]; voip: any[];
  cloudStorage: any[]; managedNas: any[]; licenses: any[]; projects: any[];
  auditLog: any[];
  stats: {
    openInvoiceTotal: number; overdueInvoiceCount: number; mrr: number;
    activeSubscriptions: number; activeCloudServices: number; activeServers: number;
    openTickets: number; criticalTickets: number;
    monitorsUp: number; monitorsDown: number; openIncidents: number;
    activeAssets: number; credentialsExpiring: number; licensesExpiring: number; renewals30: number;
    ticketCount: number; activeServices: number;
  };
};

export type CapabilityMetric = {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

export type Capability = {
  key: string;
  label: string;
  icon: LucideIcon;
  color: string;
  route: string;
  /** Items in scope for this capability (used for counts + section rendering). */
  pickItems: (v: Customer360View) => any[];
  /** Live operational metrics — appear in the KPI strip when this capability is present. */
  metrics?: (v: Customer360View) => CapabilityMetric[];
  /** Whether a dedicated tab is materialised for this capability. */
  tab?: boolean;
};

/** Ordered registry — every provider integration plugs in here. */
export const CAPABILITIES: Capability[] = [
  {
    key: "cloud", label: "Cloud & VPS", icon: Cloud, color: "#2563eb",
    route: "/cloud-ops", tab: true,
    pickItems: (v) => v.cloudServers,
    metrics: (v) => [
      { label: "Servers", value: v.cloudServers.length, tone: "info" },
      { label: "Running", value: v.stats.activeServers, tone: v.stats.activeServers > 0 ? "success" : "neutral" },
    ],
  },
  {
    key: "monitoring", label: "Monitoring", icon: Activity, color: "#0ea5e9",
    route: "/noc", tab: true,
    pickItems: (v) => v.monitoringChecks,
    metrics: (v) => {
      const total = v.monitoringChecks.length;
      const out: CapabilityMetric[] = [];
      if (total > 0) out.push({ label: "Checks up", value: `${v.stats.monitorsUp}/${total}`, tone: v.stats.monitorsDown > 0 ? "danger" : "success" });
      if (v.stats.openIncidents > 0) out.push({ label: "Open incidents", value: v.stats.openIncidents, tone: "danger" });
      return out;
    },
  },
  {
    key: "hosting", label: "Web Hosting", icon: Globe, color: "#0891b2",
    route: "/web-hosting", tab: true,
    pickItems: (v) => v.webHosting,
    metrics: (v) => [{ label: "Hosting accounts", value: v.webHosting.length, tone: "info" }],
  },
  {
    key: "starlink", label: "Starlink", icon: Satellite, color: "#7c2d12",
    route: "/starlink", tab: true,
    pickItems: (v) => v.starlink,
    metrics: (v) => [{ label: "Starlink kits", value: v.starlink.length, tone: "info" }],
  },
  {
    key: "voip", label: "VoIP", icon: PhoneCall, color: "#16a34a",
    route: "/voip", tab: true,
    pickItems: (v) => v.voip,
    metrics: (v) => [{ label: "VoIP accounts", value: v.voip.length, tone: "info" }],
  },
  {
    key: "storage", label: "Cloud Storage", icon: Database, color: "#0d9488",
    route: "/cloud-storage", tab: true,
    pickItems: (v) => v.cloudStorage,
  },
  {
    key: "nas", label: "Managed NAS", icon: HardDrive, color: "#059669",
    route: "/cloud-storage", tab: true,
    pickItems: (v) => v.managedNas,
  },
  {
    key: "licenses", label: "Licenses", icon: PackageIcon, color: "#a16207",
    route: "/licenses", tab: true,
    pickItems: (v) => v.licenses,
    metrics: (v) => {
      const out: CapabilityMetric[] = [{ label: "Licenses", value: v.licenses.length, tone: "info" }];
      if (v.stats.licensesExpiring > 0) out.push({ label: "Expiring 60d", value: v.stats.licensesExpiring, tone: "warning" });
      return out;
    },
  },
  {
    key: "projects", label: "Projects", icon: FolderKanban, color: "#7c3aed",
    route: "/projects", tab: true,
    pickItems: (v) => v.projects,
  },
  {
    key: "assets", label: "Assets & Devices", icon: Laptop, color: "#334155",
    route: "/inventory", tab: true,
    pickItems: (v) => v.assets,
    metrics: (v) => (v.assets.length > 0
      ? [{ label: "Assets", value: v.assets.length, tone: "info" as const }]
      : []),
  },
  {
    key: "subscriptions", label: "Subscriptions", icon: Server, color: "#2563eb",
    route: "/subscriptions", tab: true,
    pickItems: (v) => v.subscriptions,
    metrics: (v) => [{ label: "Active subs", value: v.stats.activeSubscriptions, tone: "info" }],
  },
  {
    key: "packages", label: "Packages", icon: Boxes, color: "#a855f7",
    route: "/catalog", tab: true,
    pickItems: (v) => v.packages,
  },
  {
    key: "tickets", label: "Support", icon: LifeBuoy, color: "#dc2626",
    route: "/tickets", tab: true,
    pickItems: (v) => v.tickets,
    metrics: (v) => {
      const out: CapabilityMetric[] = [];
      if (v.stats.openTickets > 0) out.push({ label: "Open tickets", value: v.stats.openTickets, tone: v.stats.criticalTickets > 0 ? "danger" : "warning" });
      if (v.stats.criticalTickets > 0) out.push({ label: "Critical", value: v.stats.criticalTickets, tone: "danger" });
      return out;
    },
  },
  {
    key: "credentials", label: "Credentials", icon: KeyRound, color: "#334155",
    route: "/techops/vault", tab: true,
    pickItems: (v) => v.credentials,
    metrics: (v) => (v.stats.credentialsExpiring > 0
      ? [{ label: "Creds expiring", value: v.stats.credentialsExpiring, tone: "warning" as const }]
      : []),
  },
  {
    key: "quotes", label: "Quotes", icon: FileText, color: "#0369a1",
    route: "/quotes", tab: true,
    pickItems: (v) => v.quotes,
  },
  {
    key: "invoices", label: "Invoices", icon: FileText, color: "#0f766e",
    route: "/finance", tab: true,
    pickItems: (v) => v.invoices,
  },
  {
    key: "payments", label: "Payments", icon: FileText, color: "#166534",
    route: "/payments", tab: true,
    pickItems: (v) => v.payments,
  },
  {
    key: "comms", label: "Communications", icon: MailIcon, color: "#7c3aed",
    route: "/communications", tab: true,
    pickItems: (v) => v.communications,
  },
];

/** Non-service capability entries always available on the workspace. */
export const CORE_TABS = [
  { key: "overview", label: "Overview" },
  { key: "services", label: "Services" },
  { key: "contacts", label: "Contacts" },
  { key: "timeline", label: "Timeline" },
  { key: "notes", label: "Notes" },
] as const;

/** Return only the capabilities that have live data for this customer. */
export function activeCapabilities(v: Customer360View): Capability[] {
  return CAPABILITIES.filter((c) => (c.pickItems(v)?.length ?? 0) > 0);
}

/** MRR is the ONLY financial KPI. Operational KPIs come from capability metrics. */
export type Kpi = CapabilityMetric & { key: string };
export function dynamicKpis(v: Customer360View): { mrr: number; operational: Kpi[] } {
  const seen = new Set<string>();
  const operational: Kpi[] = [];
  for (const cap of activeCapabilities(v)) {
    const metrics = cap.metrics?.(v) ?? [];
    for (const m of metrics) {
      const key = `${cap.key}:${m.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      operational.push({ key, ...m });
    }
  }
  return { mrr: v.stats.mrr, operational };
}

/** All renewals across every capability that has a renewal-like date. */
export function collectRenewals(v: Customer360View, windowDays = 120) {
  const now = Date.now();
  const rows: Array<{ kind: string; label: string; date: string; amount?: number; currency?: string; status?: string; daysLeft: number }> = [];
  const push = (kind: string, label: string, date: string | null | undefined, extra: Partial<{ amount: number; currency: string; status: string }> = {}) => {
    if (!date) return;
    const daysLeft = Math.round((new Date(date).getTime() - now) / 86_400_000);
    if (daysLeft > windowDays || daysLeft < -30) return;
    rows.push({ kind, label, date, daysLeft, ...extra });
  };
  v.subscriptions.forEach((s) => push("Subscription", s.plan_name, s.next_renewal, { amount: Number(s.amount) || 0, currency: s.currency, status: s.status }));
  v.services.forEach((s) => push("Service", s.service_name, s.renewal_date, { amount: Number(s.monthly_cost) || 0, currency: "USD", status: s.status }));
  v.licenses.forEach((l: any) => push("License", l.product ?? l.name ?? "License", l.expires_at ?? l.renewal_date, { status: l.status }));
  v.credentials.forEach((c) => push("Credential", c.name, c.expires_at));
  return rows.sort((a, b) => a.daysLeft - b.daysLeft);
}
