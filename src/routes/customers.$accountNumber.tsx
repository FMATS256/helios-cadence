import { CustomerAccountWarnings } from "@/components/customer-account-warnings";
import { serviceStatusTone, invoiceOverdue } from "@/lib/customer360/account-status";
import { csvCell } from "@/lib/safe-output";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { CustomerSalesDesk, CustomerPendingPayments } from "@/components/customer-sales-desk";
import { CustomerAccountOverview, AccountTransactions } from "@/components/customer-account-overview";
import { QuoteBuilderDialog } from "@/components/quote-builder";
import { useRoles } from "@/hooks/use-roles";
import { customerSalesPermissions } from "@/lib/customer-sales.shared";
import { ComposeEmailDialog } from "@/components/compose-email-dialog";
import { AccountAccessPanel } from "@/components/account-access-panel";
import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ClientServiceDesk } from "@/components/techops/support-desk";
import { ClientLicensesPanel } from "@/components/license-desk";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TITLES } from "@/lib/titles";
import { toast } from "sonner";
import {
  KeyRound, LifeBuoy, FileText, CreditCard, Receipt, Server, DollarSign, TrendingUp,
  Plus, FileCheck, Laptop, Activity, Sparkles, CalendarClock, Target, Building2,
  Mail, Phone, ShieldCheck, Heart, Pencil, PowerOff, Send, Bell,
  Cloud, Globe, HardDrive, Database, Satellite, PhoneCall, Mail as MailIcon, Package as PackageIcon,
  ShieldAlert, LifeBuoy as SupportIcon, Boxes, ArrowRight,
} from "lucide-react";
import { amCode, amLabel } from "@/lib/account-managers.shared";
import { listAccountManagers, assignAccountManager } from "@/lib/ops.functions";
import {
  getCustomer360, generateInvoiceForSubscription, manageSubscription,
  updateCustomerRecord, setCustomerLifecycle, sendPaymentReminder,
} from "@/lib/ops.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ArrowUpCircle, ArrowDownCircle, PauseCircle, PlayCircle, XCircle, RefreshCw, Settings2 } from "lucide-react";
import {
  AddServiceDialog, ApplyCreditDialog, RecordPaymentDialog,
  CreateQuoteDialog, CreateTicketDialog, LogCommDialog, type ClientContext,
} from "@/components/client-action-dialogs";
import { SubmitPaymentDialog } from "@/components/submit-payment-dialog";

import {
  CORE_TABS, activeCapabilities, dynamicKpis, collectRenewals,
  type Customer360View, type Capability,
} from "@/lib/customer360/capability-engine";
import {
  Customer360Workspace, type WorkspaceKind,
} from "@/components/customer360-workspaces";
import { AssignTechDialog, CustomerTasksCard } from "@/components/assign-tech-dialog";
import { Wrench } from "lucide-react";
import { ServiceDetailDialog, type ServiceDetail } from "@/components/customer360-service-detail";

export const Route = createFileRoute("/customers/$accountNumber")({
  head: ({ params }) => ({ meta: [{ title: `${params.accountNumber} — IMT Customer 360` }, { name: "description", content: "Connected client services, portal access, finance and support in IMT Customer 360." }, { property: "og:title", content: `${params.accountNumber} — IMT Customer 360` }, { property: "og:description", content: "Client account, services, finance and support workspace." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>): { tab?: string } =>
    (typeof s.tab === "string" && s.tab ? { tab: s.tab } : {}),
  component: Customer360,
  notFoundComponent: () => (
    <PageContainer><PageHeader title="Customer not found" description="That M-number doesn't exist." /></PageContainer>
  ),
});

function money(n: number, ccy = "USD") {
  return `${ccy} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function daysUntil(d?: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.round(ms / 86400000);
}

function computeHealth(view: any): { score: number; label: string; tone: "success" | "warning" | "danger" } {
  let score = 100;
  const outstanding = Number(view?.stats?.openInvoiceTotal || 0);
  const overdue = (view?.invoices || []).filter((i: any) => i.status === "overdue").length;
  const openTickets = (view?.tickets || []).filter((t: any) => t.status !== "resolved" && t.status !== "closed").length;
  const critical = (view?.tickets || []).filter((t: any) => t.priority === "critical" && t.status !== "resolved").length;
  const active = view?.stats?.activeServices || 0;
  if (outstanding > 0) score -= Math.min(25, Math.floor(outstanding / 100));
  score -= overdue * 8;
  score -= openTickets * 3;
  score -= critical * 10;
  if (active === 0) score -= 15;
  score = Math.max(5, Math.min(100, score));
  const tone = score >= 75 ? "success" : score >= 50 ? "warning" : "danger";
  const label = score >= 75 ? "Healthy" : score >= 50 ? "At risk" : "Critical";
  return { score, label, tone };
}

function tierOf(amount: number, cycle?: string): "platinum" | "gold" | "silver" | "bronze" {
  const monthly = (cycle || "monthly").toLowerCase() === "yearly" || (cycle || "").toLowerCase() === "annual"
    ? Number(amount || 0) / 12
    : (cycle || "").toLowerCase() === "quarterly" ? Number(amount || 0) / 3 : Number(amount || 0);
  if (monthly >= 1000) return "platinum";
  if (monthly >= 300) return "gold";
  if (monthly >= 50) return "silver";
  return "bronze";
}

function subHealthScore(s: any): number {
  if (s.status === "cancelled") return 0;
  if (s.status === "paused") return 40;
  const d = (s.next_renewal ? Math.round((new Date(s.next_renewal).getTime() - Date.now()) / 86400000) : null);
  if (d == null) return 80;
  if (d < 0) return Math.max(5, 30 + d); // overdue drops fast
  if (d <= 7) return 55;
  if (d <= 30) return 75;
  return 95;
}

function toCsv(rows: Array<Record<string, any>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => csvCell(v);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}


/** IMT service lines — canonical taxonomy shown across Customer 360 sections. */
const SERVICE_LINES: Array<{
  key: string;
  label: string;
  icon: any;
  color: string;
  route: string;
  match: (text: string) => boolean;
}> = [
  { key: "cloud",       label: "Cloud & VPS",         icon: Cloud,       color: "#2563eb", route: "/cloud-ops",           match: (t) => /(vps|cloud|server|vm|instance|kamatera|vultr|contabo|kvm)/i.test(t) },
  { key: "hosting",     label: "Web Hosting",         icon: Globe,       color: "#0891b2", route: "/web-hosting",     match: (t) => /(hosting|cpanel|website|wordpress|shared host)/i.test(t) },
  { key: "domains",     label: "Domains & DNS",       icon: Globe,       color: "#7c3aed", route: "/web-hosting",     match: (t) => /(domain|dns|\.co\.zw|\.com|registrar)/i.test(t) },
  { key: "m365",        label: "Microsoft 365",       icon: MailIcon,    color: "#0369a1", route: "/licenses",        match: (t) => /(m365|microsoft ?365|office ?365|exchange|outlook)/i.test(t) },
  { key: "security",    label: "Cybersecurity",       icon: ShieldAlert, color: "#dc2626", route: "/cloud-ops", match: (t) => /(security|kaspersky|sophos|antivirus|edr|soc|firewall|endpoint)/i.test(t) },
  { key: "starlink",    label: "Starlink",            icon: Satellite,   color: "#7c2d12", route: "/starlink",        match: (t) => /(starlink|satellite)/i.test(t) },
  { key: "voip",        label: "VoIP / Telephony",    icon: PhoneCall,   color: "#16a34a", route: "/voip",            match: (t) => /(voip|sip|pbx|telephony|dandemutande|call)/i.test(t) },
  { key: "nas",         label: "Managed NAS",         icon: HardDrive,   color: "#059669", route: "/cloud-storage",     match: (t) => /(nas|synology|qnap|file server)/i.test(t) },
  { key: "storage",     label: "Cloud Storage",       icon: Database,    color: "#0d9488", route: "/cloud-storage",   match: (t) => /(storage|s3|backup storage|object store)/i.test(t) },
  { key: "backup",      label: "Backup & DR",         icon: Database,    color: "#4338ca", route: "/cloud-ops",       match: (t) => /(backup|dr|disaster|acronis|veeam)/i.test(t) },
  { key: "licenses",    label: "Software Licenses",   icon: PackageIcon, color: "#a16207", route: "/licenses",        match: (t) => /(licen[sc]e|subscription key|product key)/i.test(t) },
  { key: "trackx",      label: "TrackX / Devices",    icon: Laptop,      color: "#334155", route: "/inventory", match: (t) => /(trackx|laptop|device|asset tracking|absolute)/i.test(t) },
  { key: "support",     label: "Managed Support",     icon: SupportIcon, color: "#0f766e", route: "/tickets",         match: (t) => /(support|managed|sla|helpdesk|retainer)/i.test(t) },
];

function classifyServiceLine(...parts: Array<string | null | undefined>): string {
  const text = parts.filter(Boolean).join(" ");
  for (const line of SERVICE_LINES) if (line.match(text)) return line.key;
  return "other";
}

/* Colorful per-tab accents — every tab gets its own token color so the
   strip reads as pressable. Only tabs with data are shown. */
const TAB_STYLES: Record<string, string> = {
  overview:       "text-chart-2/70 hover:bg-chart-2/10 hover:text-chart-2 data-[state=active]:bg-chart-2/15 data-[state=active]:text-chart-2 data-[state=active]:border-chart-2/40 data-[state=active]:font-semibold",
  services:       "text-chart-4/70 hover:bg-chart-4/10 hover:text-chart-4 data-[state=active]:bg-chart-4/15 data-[state=active]:text-chart-4 data-[state=active]:border-chart-4/40 data-[state=active]:font-semibold",
  "services-mgmt":"text-info/70 hover:bg-info/10 hover:text-info data-[state=active]:bg-info/15 data-[state=active]:text-info data-[state=active]:border-info/40 data-[state=active]:font-semibold",
  packages:       "text-chart-1/70 hover:bg-chart-1/10 hover:text-chart-1 data-[state=active]:bg-chart-1/15 data-[state=active]:text-chart-1 data-[state=active]:border-chart-1/40 data-[state=active]:font-semibold",
  subscriptions:  "text-chart-3/70 hover:bg-chart-3/10 hover:text-chart-3 data-[state=active]:bg-chart-3/15 data-[state=active]:text-chart-3 data-[state=active]:border-chart-3/40 data-[state=active]:font-semibold",
  transactions:   "text-solar/80 hover:bg-solar/10 hover:text-solar data-[state=active]:bg-solar/15 data-[state=active]:text-solar data-[state=active]:border-solar/40 data-[state=active]:font-semibold",
  invoices:       "text-amber/70 hover:bg-amber/10 hover:text-amber data-[state=active]:bg-amber/15 data-[state=active]:text-amber data-[state=active]:border-amber/40 data-[state=active]:font-semibold",
  payments:       "text-success/70 hover:bg-success/10 hover:text-success data-[state=active]:bg-success/15 data-[state=active]:text-success data-[state=active]:border-success/40 data-[state=active]:font-semibold",
  quotes:         "text-violet/70 hover:bg-violet/10 hover:text-violet data-[state=active]:bg-violet/15 data-[state=active]:text-violet data-[state=active]:border-violet/40 data-[state=active]:font-semibold",
  assets:         "text-teal/70 hover:bg-teal/10 hover:text-teal data-[state=active]:bg-teal/15 data-[state=active]:text-teal data-[state=active]:border-teal/40 data-[state=active]:font-semibold",
  tickets:        "text-destructive/70 hover:bg-destructive/10 hover:text-destructive data-[state=active]:bg-destructive/15 data-[state=active]:text-destructive data-[state=active]:border-destructive/40 data-[state=active]:font-semibold",
  licences:       "text-info/70 hover:bg-info/10 hover:text-info data-[state=active]:bg-info/15 data-[state=active]:text-info data-[state=active]:border-info/40 data-[state=active]:font-semibold",
  renewals:       "text-chart-1/70 hover:bg-chart-1/10 hover:text-chart-1 data-[state=active]:bg-chart-1/15 data-[state=active]:text-chart-1 data-[state=active]:border-chart-1/40 data-[state=active]:font-semibold",
  contacts:       "text-chart-3/70 hover:bg-chart-3/10 hover:text-chart-3 data-[state=active]:bg-chart-3/15 data-[state=active]:text-chart-3 data-[state=active]:border-chart-3/40 data-[state=active]:font-semibold",
  credentials:    "text-chart-2/70 hover:bg-chart-2/10 hover:text-chart-2 data-[state=active]:bg-chart-2/15 data-[state=active]:text-chart-2 data-[state=active]:border-chart-2/40 data-[state=active]:font-semibold",
  comms:          "text-violet/70 hover:bg-violet/10 hover:text-violet data-[state=active]:bg-violet/15 data-[state=active]:text-violet data-[state=active]:border-violet/40 data-[state=active]:font-semibold",
  timeline:       "text-teal/70 hover:bg-teal/10 hover:text-teal data-[state=active]:bg-teal/15 data-[state=active]:text-teal data-[state=active]:border-teal/40 data-[state=active]:font-semibold",
  notes:          "text-amber/70 hover:bg-amber/10 hover:text-amber data-[state=active]:bg-amber/15 data-[state=active]:text-amber data-[state=active]:border-amber/40 data-[state=active]:font-semibold",
};

/** Ordered tab labels — the visibility map is supplied per customer. */
function tabList(show: Record<string, boolean>) {
  const labels: Record<string, string> = {
    overview: "Overview", services: "Services", "services-mgmt": "Services Mgmt",
    packages: "Packages", subscriptions: "Subscriptions", transactions: "Transactions",
    invoices: "Invoices", payments: "Payments", quotes: "Quotes", assets: "Assets",
    tickets: "Tickets", renewals: "Renewals", licences: "Licences", contacts: "Contacts",
    credentials: "Credentials", comms: "Communications", timeline: "Timeline", notes: "Notes", access: "Portal & Support", desk: "Service desk",
  };
  return Object.keys(labels)
    .filter((k) => show[k])
    .map((value) => ({ value, label: labels[value] }));
}


function Customer360() {
  const { accountNumber } = Route.useParams();
  const { tab } = Route.useSearch();
  const navigate = useNavigate();
  const activeTab = tab || "overview";
  const tabBodyRef = useRef<HTMLDivElement>(null);
  const setActiveTab = (v: string) => {
    // Keep the tab strip visually still: before swapping tabs, reserve enough
    // page height for the current scroll depth so a shorter tab cannot shrink
    // the page and drag the strip, and skip the router's scroll reset.
    const list = document.querySelector('[role="tablist"]') as HTMLElement | null;
    if (list && tabBodyRef.current) {
      const needed = window.scrollY + window.innerHeight - list.offsetTop;
      if (needed > 0) tabBodyRef.current.style.minHeight = `${needed}px`;
    }
    navigate({
      to: "/customers/$accountNumber",
      params: { accountNumber },
      search: v === "overview" ? {} : { tab: v },
      replace: true,
      resetScroll: false,
    });
  };
  const { user } = useAuth();
  const { roles } = useRoles();
  const salesPermissions = customerSalesPermissions(roles);
  const qc = useQueryClient();
  const fetch360 = useServerFn(getCustomer360);
  const genInvoice = useServerFn(generateInvoiceForSubscription);
  const updateCust = useServerFn(updateCustomerRecord);
  const lifecycle = useServerFn(setCustomerLifecycle);
  const remind = useServerFn(sendPaymentReminder);

  const { data: view, isLoading } = useQuery({
    queryKey: ["customer-360", accountNumber],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch360({ data: { account_number: accountNumber } });
      if (!res) throw notFound();
      return res;
    },
  });

  const customer = view?.customer;

  const fetchManagers = useServerFn(listAccountManagers);
  const assignAm = useServerFn(assignAccountManager);
  const { data: amRecords = [] } = useQuery({
    queryKey: ["account-managers"],
    enabled: !!user,
    queryFn: () => fetchManagers(),
  });
  const accountManager = useMemo(
    () => (amRecords as any[]).find((m) => m.id === (customer as any)?.account_manager_id) ?? null,
    [amRecords, customer],
  );
  const reassignAm = useMutation({
    mutationFn: (managerId: string) =>
      assignAm({ data: { customer_id: customer!.id, account_manager_id: managerId === "__none__" ? null : managerId } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] });
      toast.success(res?.account_manager ? `Assigned to ${amLabel(res.account_manager)}` : "Account manager removed");
    },
    onError: (e: any) => toast.error(e.message || "Could not reassign account manager"),
  });

  // Contacts / branches / notes / communications now flow from the single aggregation.
  const contacts = (view as any)?.contacts ?? [];
  const branches = (view as any)?.branches ?? [];
  const notes = (view as any)?.notes ?? [];
  const communications = (view as any)?.communications ?? [];

  const [noteBody, setNoteBody] = useState("");
  const addNote = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_notes").insert({ customer_id: customer!.id, account_number: customer!.account_number, body: noteBody, author_id: user?.id ?? null });
      if (error) throw error;
    },
    onSuccess: () => { setNoteBody(""); qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success("Note added"); },
  });

  const [contactForm, setContactForm] = useState({ name: "", role: "", contact_type: "general", email: "", phone: "" });
  const addContact = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customer_contacts").insert({ customer_id: customer!.id, account_number: customer!.account_number, ...contactForm });
      if (error) throw error;
    },
    onSuccess: () => { setContactForm({ name: "", role: "", contact_type: "general", email: "", phone: "" }); qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success("Contact added"); },
  });

  const invoiceFromSub = useMutation({
    mutationFn: async (subscription_id: string) => genInvoice({ data: { subscription_id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success("Invoice generated"); },
    onError: (e: any) => toast.error(e?.message || "Could not generate invoice"),
  });

  const manageSub = useServerFn(manageSubscription);
  const subAction = useMutation({
    mutationFn: async (input: Parameters<typeof manageSubscription>[0]["data"]) => manageSub({ data: input }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] });
      toast.success(`Subscription ${vars.action} applied`);
    },
    onError: (e: any) => toast.error(e?.message || "Action failed"),
  });

  const [serviceDetail, setServiceDetail] = useState<ServiceDetail | null>(null);
  const [editSub, setEditSub] = useState<{ sub: any; mode: "upgrade" | "downgrade" } | null>(null);
  const [editForm, setEditForm] = useState({ plan_name: "", description: "", amount: 0, billing_cycle: "monthly" });

  const [editCustOpen, setEditCustOpen] = useState(false);
  const [custForm, setCustForm] = useState({ company_name: "", title: "", industry: "", primary_email: "", primary_phone: "", website: "", billing_address: "" });
  const editCustomer = useMutation({
    mutationFn: async () => updateCust({ data: { customer_id: view!.customer.id, ...custForm } }),
    onSuccess: () => { setEditCustOpen(false); qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success("Customer updated"); },
    onError: (e: any) => toast.error(e?.message || "Update failed"),
  });
  const toggleLifecycle = useMutation({
    mutationFn: async (action: "suspend" | "resume") => lifecycle({ data: { customer_id: view!.customer.id, action } }),
    onSuccess: (_d, action) => { qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] }); toast.success(action === "suspend" ? "Customer suspended" : "Customer resumed"); },
    onError: (e: any) => toast.error(e?.message || "Action failed"),
  });
  const sendReminder = useMutation({
    mutationFn: async () => remind({ data: { customer_id: view!.customer.id } }),
    onSuccess: (r: any) => toast.success(`Reminder${r?.sent > 1 ? "s" : ""} sent (${r?.sent ?? 1})`),
    onError: (e: any) => toast.error(e?.message || "Could not send reminder"),
  });

  const [svcFilters, setSvcFilters] = useState({
    q: "",
    status: "all" as "all" | "active" | "paused" | "cancelled",
    tier: "all" as "all" | "platinum" | "gold" | "silver" | "bronze",
    startFrom: "",
    startTo: "",
    renewFrom: "",
    renewTo: "",
    minHealth: 0,
    sortBy: "next_renewal" as "next_renewal" | "started_on" | "amount" | "plan_name" | "health",
    sortDir: "asc" as "asc" | "desc",
  });

  const health = useMemo(() => view ? computeHealth(view) : null, [view]);


  function subHealth(s: any): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
    if (s.status === "cancelled") return { label: "Cancelled", tone: "danger" };
    if (serviceStatusTone(s.status) === "danger") return { label: s.status || "Unknown", tone: "danger" };
    const d = daysUntil(s.next_renewal);
    if (d == null) return { label: "Active", tone: "success" };
    if (d < 0) return { label: `Overdue ${Math.abs(d)}d`, tone: "danger" };
    if (d <= 7) return { label: `Renews ${d}d`, tone: "danger" };
    if (d <= 30) return { label: `Renews ${d}d`, tone: "warning" };
    return { label: `Renews ${d}d`, tone: "success" };
  }

  const renewals = useMemo(() => {
    if (!view) return [];
    const rows: any[] = [];
    (view.subscriptions || []).forEach((s: any) => {
      if (s.next_renewal) rows.push({ kind: "Subscription", label: s.plan_name, date: s.next_renewal, amount: s.amount, currency: s.currency, status: s.status });
    });
    (view.services || []).forEach((s: any) => {
      if (s.renewal_date) rows.push({ kind: "Service", label: s.service_name, date: s.renewal_date, amount: s.monthly_cost, currency: "USD", status: s.status });
    });
    (view.credentials || []).forEach((c: any) => {
      if (c.expires_at) rows.push({ kind: "Credential", label: c.name, date: c.expires_at, status: "active" });
    });
    return rows
      .map((r) => ({ ...r, daysLeft: daysUntil(r.date) }))
      .filter((r) => r.daysLeft !== null && r.daysLeft <= 120 && r.daysLeft >= -30)
      .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));
  }, [view]);

  const opportunities = useMemo(() => {
    if (!view) return [] as { title: string; hint: string }[];
    const ops: { title: string; hint: string }[] = [];
    const cats = new Set((view.packages || []).map((p: any) => p.catalog?.category).filter(Boolean));
    const services = view.services || [];
    if (!cats.has("cybersecurity") && !services.some((s: any) => s.service_type === "security")) {
      ops.push({ title: "Cross-sell: Cybersecurity", hint: "No security package on file — pitch SOC + Endpoint bundle." });
    }
    if (!cats.has("m365")) {
      ops.push({ title: "Cross-sell: Microsoft 365", hint: "No M365 license — quote Business Standard/Premium." });
    }
    if (!services.some((s: any) => s.service_type === "backup")) {
      ops.push({ title: "Add Backup & DR", hint: "Attach cloud backup for existing servers." });
    }
    if ((view.tickets || []).filter((t: any) => t.status !== "resolved").length > 3) {
      ops.push({ title: "Managed Services upsell", hint: "High ticket volume — propose managed support retainer." });
    }
    return ops.slice(0, 5);
  }, [view]);

  // Group everything (subs, services, packages, assets, credentials) by IMT service line.
  const serviceLineGroups = useMemo(() => {
    const v = view as any;
    const buckets = new Map<string, { subs: any[]; services: any[]; packages: any[]; assets: any[]; credentials: any[]; mrr: number; count: number }>();
    const bucket = (key: string) => {
      if (!buckets.has(key)) buckets.set(key, { subs: [], services: [], packages: [], assets: [], credentials: [], mrr: 0, count: 0 });
      return buckets.get(key)!;
    };
    (v?.subscriptions || []).forEach((s: any) => {
      const k = classifyServiceLine(s.plan_name, s.description, s.billing_cycle);
      const b = bucket(k);
      b.subs.push(s);
      b.count++;
      if (s.status === "active") {
        const amt = Number(s.amount) || 0;
        const cyc = (s.billing_cycle || "monthly").toLowerCase();
        b.mrr += cyc === "yearly" || cyc === "annual" ? amt / 12 : cyc === "quarterly" ? amt / 3 : amt;
      }
    });
    (v?.services || []).forEach((s: any) => {
      const k = classifyServiceLine(s.service_name, s.service_type, s.vendor, s.plan);
      const b = bucket(k);
      b.services.push(s);
      b.count++;
      if (s.status === "active") b.mrr += Number(s.monthly_cost) || 0;
    });
    (v?.packages || []).forEach((p: any) => {
      const k = classifyServiceLine(p.catalog?.name, p.catalog?.category, p.catalog?.code);
      bucket(k).packages.push(p);
    });
    (v?.assets || []).forEach((a: any) => {
      const k = classifyServiceLine(a.asset_type, a.name, a.model);
      bucket(k).assets.push(a);
    });
    (v?.credentials || []).forEach((c: any) => {
      const k = classifyServiceLine(c.name, c.category, c.system);
      bucket(k).credentials.push(c);
    });
    return SERVICE_LINES
      .map((line) => ({ line, data: buckets.get(line.key) }))
      .filter((row) => row.data && row.data.count + row.data.packages.length + row.data.assets.length + row.data.credentials.length > 0);
  }, [view]);

  // Service Capability Engine — dynamic KPIs / tabs / sections driven by real data.
  const caps: Capability[] = useMemo(() => (view ? activeCapabilities(view as Customer360View) : []), [view]);
  const kpis = useMemo(() => (view ? dynamicKpis(view as Customer360View) : []), [view]);
  const renewalsAll = useMemo(() => (view ? collectRenewals(view as Customer360View) : []), [view]);
  const capByKey = useMemo(() => Object.fromEntries(caps.map((c) => [c.key, c])) as Record<string, Capability>, [caps]);

  if (isLoading) return <PageContainer><p className="text-sm text-muted-foreground">Loading…</p></PageContainer>;
  if (!customer || !view) return null;


  const { services, subscriptions, invoices, payments, quotes, tickets, credentials, timeline, stats, packages = [], assets = [] } = view as any;
  const customerSince = customer.created_at ? new Date(customer.created_at) : null;
  const tier = ((customer as any).tier || (stats.mrr > 2000 ? "platinum" : stats.mrr > 500 ? "gold" : stats.mrr > 100 ? "silver" : "bronze")) as string;
  const tierTone = tier === "platinum" ? "solar" : tier === "gold" ? "warning" : tier === "silver" ? "info" : "neutral";
  const contractActive = subscriptions.some((s: any) => s.status === "active");

  const enrichedSubs = (subscriptions as any[]).map((s) => ({
    ...s,
    _tier: tierOf(Number(s.amount) || 0, s.billing_cycle),
    _score: subHealthScore(s),
  }));
  const inRange = (d: string | null | undefined, from: string, to: string) => {
    if (!from && !to) return true;
    if (!d) return false;
    const t = new Date(d).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to).getTime() + 86399999) return false;
    return true;
  };
  const visibleSubs = enrichedSubs
    .filter((s) => {
      if (svcFilters.q) {
        const q = svcFilters.q.toLowerCase();
        if (!`${s.plan_name ?? ""} ${s.description ?? ""}`.toLowerCase().includes(q)) return false;
      }
      if (svcFilters.status !== "all" && s.status !== svcFilters.status) return false;
      if (svcFilters.tier !== "all" && s._tier !== svcFilters.tier) return false;
      if (!inRange(s.started_on, svcFilters.startFrom, svcFilters.startTo)) return false;
      if (!inRange(s.next_renewal, svcFilters.renewFrom, svcFilters.renewTo)) return false;
      if (s._score < svcFilters.minHealth) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = svcFilters.sortDir === "asc" ? 1 : -1;
      const k = svcFilters.sortBy;
      if (k === "health") return (a._score - b._score) * dir;
      if (k === "amount") return ((Number(a.amount) || 0) - (Number(b.amount) || 0)) * dir;
      if (k === "plan_name") return String(a.plan_name ?? "").localeCompare(String(b.plan_name ?? "")) * dir;
      const av = a[k] ? new Date(a[k]).getTime() : Number.POSITIVE_INFINITY;
      const bv = b[k] ? new Date(b[k]).getTime() : Number.POSITIVE_INFINITY;
      return (av - bv) * dir;
    });

  const exportSubsCsv = () => {
    const rows = visibleSubs.map((s) => ({
      plan_name: s.plan_name ?? "",
      description: s.description ?? "",
      status: s.status ?? "",
      tier: s._tier,
      billing_cycle: s.billing_cycle ?? "",
      started_on: s.started_on ?? "",
      next_renewal: s.next_renewal ?? "",
      amount: Number(s.amount) || 0,
      currency: s.currency ?? "USD",
      health_score: s._score,
    }));
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${customer.account_number}-services-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  };

  const initials = (customer.company_name || "?")
    .split(/\s+/)
    .map((w: string) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();


  const toneClass = (t?: string) =>
    t === "success" ? "text-success" :
    t === "warning" ? "text-warning" :
    t === "danger" ? "text-destructive" :
    t === "info" ? "text-solar" : "text-foreground";

  return (
    <PageContainer><div className="sharp-corners space-y-6">
      {/* Breadcrumb bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border text-sm">
        <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
          <Link to="/customers" className="hover:text-foreground">Customers</Link>
          <span>/</span>
          <Link to="/customers" className="hover:text-foreground">Subscribers</Link>
          <span>/</span>
          <span className="text-foreground font-medium truncate">{customer.account_number} Subscriber</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => { if (confirm(`Suspend ${customer.company_name}?`)) toggleLifecycle.mutate("suspend"); }}>
            <XCircle className="h-4 w-4 mr-1.5" />{customer.status === "active" ? "Suspend" : "Terminate"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setCustForm({ company_name: customer.company_name || "", title: (customer as any).title || "", industry: customer.industry || "", primary_email: customer.primary_email || "", primary_phone: customer.primary_phone || "", website: customer.website || "", billing_address: (customer as any).billing_address || "" }); setEditCustOpen(true); }}>
            <Pencil className="h-4 w-4 mr-1.5" />Details
          </Button>
        </div>
      </div>

      <CustomerAccountWarnings view={view} onNavigate={setActiveTab} />

      {/* Hero: identity block (left) + dynamic capability-driven KPIs (right) */}
      <div className="mt-4 grid grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)] gap-4">
        {/* Identity block */}
        <Card className="border-border">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="h-24 w-24 rounded-full flex items-center justify-center text-navy-foreground font-display text-3xl font-bold shadow-[var(--shadow-elegant)]" style={{ background: "var(--gradient-navy)" }}>
              {initials}
            </div>
            <p className="mt-4 font-display font-bold text-xl tracking-wide truncate max-w-full">{customer.company_name}</p>
            <p className="text-xs font-mono text-muted-foreground mt-1">({customer.account_number})</p>
            <div className="flex items-center gap-2 mt-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold ${customer.status === "active" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${customer.status === "active" ? "bg-success" : "bg-muted-foreground"}`} />
                {customer.status === "active" ? "Active" : (customer.status || "Inactive")}
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold bg-muted text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                {contractActive ? "Contract active" : "No active contract"}
              </span>
            </div>
            <div className="w-full mt-5 pt-4 border-t border-border grid grid-cols-2 gap-y-2 text-left text-xs">
              <MetaRow label="Account Manager" value={
                <Select
                  value={accountManager?.id ?? "__none__"}
                  onValueChange={(v) => reassignAm.mutate(v)}
                  disabled={reassignAm.isPending}
                >
                  <SelectTrigger className="h-7 w-full text-[11px] px-2" onClick={(e) => e.stopPropagation()}>
                    <SelectValue placeholder="Unassigned">
                      {accountManager ? `${amCode(accountManager)} · ${accountManager.full_name || accountManager.email}` : "Unassigned"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {(amRecords as any[]).map((m) => (
                      <SelectItem key={m.id} value={m.id}>{amLabel(m)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              } />
              <MetaRow label="Account Type" value={(customer as any).account_type || "Regular"} pill />
              <MetaRow label="Monthly Value" value={`$${Number(stats.mrr || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
              <MetaRow label="Balance Due" value={
                <span className={stats.overdueInvoiceCount > 0 ? "text-destructive font-semibold" : Number(stats.openInvoiceTotal) > 0 ? "text-warning font-semibold" : "text-success font-semibold"}>
                  {Number(stats.openInvoiceTotal) > 0 ? `$${Number(stats.openInvoiceTotal).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${stats.overdueInvoiceCount > 0 ? ` · ${stats.overdueInvoiceCount} overdue` : ""}` : "Up to date"}
                </span>
              } />
              <MetaRow label="Active Services" value={`${(stats.activeSubscriptions || 0) + (packages as any[]).filter((p: any) => p.status === "active").length}`} />
              <MetaRow label="Renewals (30d)" value={<span className={stats.renewals30 > 0 ? "text-warning font-semibold" : ""}>{stats.renewals30 || 0}</span>} />
              <MetaRow label="Open Tickets" value={<span className={stats.criticalTickets > 0 ? "text-destructive font-semibold" : ""}>{stats.openTickets || 0}{stats.criticalTickets > 0 ? ` · ${stats.criticalTickets} critical` : ""}</span>} />
              <MetaRow label="Client Since" value={customerSince ? customerSince.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"} />
              <MetaRow label="Phone" value={customer.primary_phone || "—"} />
              <MetaRow label="Industry" value={customer.industry || "—"} />
            </div>
          </CardContent>
        </Card>

        {/* ISP-style dynamic hero pane — layout pixel-matched, every value dynamic.
            No fake fillers: rows/chips whose underlying data is missing are omitted or
            replaced with the closest live equivalent for the customer's actual services. */}
        <IspHeroPane
          view={view as Customer360View}
          stats={stats}
          onLifecycle={(a: "suspend" | "resume") => toggleLifecycle.mutate(a)}
          onSendReminder={() => sendReminder.mutate()}
          onEdit={() => { setCustForm({ company_name: customer.company_name || "", title: (customer as any).title || "", industry: customer.industry || "", primary_email: customer.primary_email || "", primary_phone: customer.primary_phone || "", website: customer.website || "", billing_address: (customer as any).billing_address || "" }); setEditCustOpen(true); }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["customer-360", accountNumber] })}
        />
      </div>



      {/* Edit customer dialog */}
      <Dialog open={editCustOpen} onOpenChange={setEditCustOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit customer · {customer.company_name}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Title</Label>
              <Select value={custForm.title || "none"} onValueChange={(v) => setCustForm({ ...custForm, title: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Name</Label><Input value={custForm.company_name} onChange={(e) => setCustForm({ ...custForm, company_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Industry</Label><Input value={custForm.industry} onChange={(e) => setCustForm({ ...custForm, industry: e.target.value })} /></div>
            <div className="space-y-1"><Label>Website</Label><Input value={custForm.website} onChange={(e) => setCustForm({ ...custForm, website: e.target.value })} /></div>
            <div className="space-y-1"><Label>Primary email</Label><Input type="email" value={custForm.primary_email} onChange={(e) => setCustForm({ ...custForm, primary_email: e.target.value })} /></div>
            <div className="space-y-1"><Label>Primary phone</Label><Input value={custForm.primary_phone} onChange={(e) => setCustForm({ ...custForm, primary_phone: e.target.value })} /></div>
            <div className="col-span-2 space-y-1"><Label>Billing address</Label><Textarea rows={2} value={custForm.billing_address} onChange={(e) => setCustForm({ ...custForm, billing_address: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditCustOpen(false)}>Cancel</Button>
            <Button onClick={() => editCustomer.mutate()} disabled={editCustomer.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
              {editCustomer.isPending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1.5 sticky top-16 z-20 shadow-sm border border-border/60">
          {tabList({
            overview: true, services: subscriptions.length + services.length + packages.length > 0,
            "services-mgmt": subscriptions.length > 0, packages: packages.length > 0,
            subscriptions: subscriptions.length > 0, transactions: (invoices.length + payments.length) > 0,
            invoices: true, payments: true,
            quotes: salesPermissions.canQuote || quotes.length > 0, assets: assets.length > 0, tickets: tickets.length > 0,
            renewals: renewalsAll.length > 0, licences: true, contacts: (contacts.length + branches.length) > 0,
            credentials: credentials.length > 0, comms: communications.length > 0,
            timeline: timeline.length > 0, notes: true, access: true, desk: true,
          }).map((t) => (
            <TabsTrigger key={t.value} value={t.value} className={TAB_STYLES[t.value] ?? TAB_STYLES.overview}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Reserve the current viewing depth so switching to a shorter tab
            cannot shrink the page and yank the tab strip out of place. */}
        <div ref={tabBodyRef}>
        <TabsContent value="desk" className="mt-4"><ClientServiceDesk customerId={customer.id} /></TabsContent>
        <TabsContent value="access" className="mt-4 space-y-6">
          <AccountAccessPanel customerId={customer.id} />
          <div className="border-t border-border pt-4 flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link to="/leads" search={{ view: "accounts" }}><Building2 className="h-4 w-4 mr-2" />Account workspace</Link></Button>
            <Button asChild variant="outline"><Link to="/noc"><Activity className="h-4 w-4 mr-2" />NOC support</Link></Button>
            <Button asChild variant="outline"><Link to="/customers/$accountNumber" params={{ accountNumber }} search={{ tab: "tickets" }} resetScroll={false}><LifeBuoy className="h-4 w-4 mr-2" />Account tickets</Link></Button>
          </div>
        </TabsContent>
        <TabsContent value="overview" className="mt-4">
          <CustomerAccountOverview view={view} />
          <div className="mt-6 border-t border-border pt-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><FileText className="h-4 w-4 text-solar" />Profile</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                <Row k="Account #" v={<span className="font-mono text-solar font-semibold">{customer.account_number}</span>} />
                <Row k="Tier" v={<StatusPill tone={tierTone as any}>{tier}</StatusPill>} />
                <Row k="Payment standing" v={(() => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = (invoices as any[]).filter((i) => invoiceOverdue(i, today));
                  const last = [...(payments as any[])].sort((a, b) => String(b.paid_at || b.created_at).localeCompare(String(a.paid_at || a.created_at)))[0];
                  return <span className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={overdue.length ? "danger" : "success"}>{overdue.length ? `Overdue (${overdue.length})` : "Good standing"}</StatusPill>
                    {last && <span className="text-xs text-muted-foreground">Last payment {new Date(last.paid_at || last.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
                  </span>;
                })()} />
                <Row k="Industry" v={customer.industry || "—"} />
                <Row k="Website" v={customer.website || "—"} />
                <Row k="Billing address" v={customer.billing_address || "—"} />
                <Row k="Branches" v={branches.length} />
                <Row k="Contacts" v={contacts.length} />
                <Row k="Customer since" v={customerSince ? customerSince.toLocaleDateString() : "—"} />
                <Row k="Active services" v={stats.activeServices} />
                <Row k="Assets" v={assets.length} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Sparkles className="h-4 w-4 text-solar" />AI Summary</CardTitle></CardHeader>
              <CardContent className="text-sm space-y-2">
                <p>
                  <span className="font-semibold">{customer.company_name}</span> has{" "}
                  <span className="text-solar font-semibold">{stats.activeServices}</span> active services generating{" "}
                  <span className="text-solar font-semibold">{money(stats.mrr)}</span> MRR.
                </p>
                <p>
                  Outstanding balance: <span className={stats.openInvoiceTotal > 0 ? "text-destructive font-semibold" : "font-semibold"}>{money(stats.openInvoiceTotal)}</span>.{" "}
                  {renewals.length > 0 && <>Next renewal: <span className="font-semibold">{renewals[0].label}</span> in {renewals[0].daysLeft} days.</>}
                </p>
                {opportunities[0] && (
                  <p className="pt-2 border-t border-border/60 text-muted-foreground">
                    <span className="font-semibold text-foreground">Recommended:</span> {opportunities[0].title} — {opportunities[0].hint}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Activity className="h-4 w-4 text-solar" />Latest activity</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {timeline.slice(0, 8).map((e: any) => (
                  <div key={e.id} className="flex items-start justify-between p-2 rounded hover:bg-muted/40">
                    <div>
                      <p className="font-medium">{e.title || e.event_type}</p>
                      {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                  </div>
                ))}
                {timeline.length === 0 && <p className="text-muted-foreground">No activity yet.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="font-display flex items-center gap-2"><Target className="h-4 w-4 text-solar" />Opportunities</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {opportunities.length === 0 && <p className="text-muted-foreground">No opportunities detected — fully covered account.</p>}
                {opportunities.map((o, i) => (
                  <div key={i} className="p-2 rounded border border-border">
                    <p className="font-semibold">{o.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{o.hint}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display flex items-center gap-2"><CalendarClock className="h-4 w-4 text-solar" />Upcoming renewals (120 days)</CardTitle>
                <span className="text-xs text-muted-foreground">{renewals.length} items</span>
              </CardHeader>
              <CardContent className="p-0 divide-y">
                {renewals.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No renewals due in the next 120 days.</p>}
                {renewals.slice(0, 8).map((r, i) => (
                  <div key={i} className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{r.label} <span className="text-xs text-muted-foreground font-normal">· {r.kind}</span></p>
                      <p className="text-xs text-muted-foreground">Due {new Date(r.date).toLocaleDateString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {r.amount != null && <span className="text-sm font-mono">{money(r.amount, r.currency || "USD")}</span>}
                      <StatusPill tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 7 ? "danger" : r.daysLeft <= 30 ? "warning" : "info"}>
                        {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d`}
                      </StatusPill>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* IMT service lines snapshot */}
            <Card className="lg:col-span-3">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-display flex items-center gap-2"><Boxes className="h-4 w-4 text-solar" />IMT service lines</CardTitle>
                <Link to="/customers/$accountNumber" params={{ accountNumber }} search={{ tab: "services" }} className="text-xs text-solar hover:underline">View all →</Link>
              </CardHeader>
              <CardContent>
                {serviceLineGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No service lines on file yet. Assign packages from the Packages tab.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {serviceLineGroups.map(({ line, data }) => {
                      const Icon = line.icon;
                      return (
                        <Link key={line.key} to={line.route} className="group p-3 rounded border border-border hover:border-solar transition-colors flex items-start gap-3">
                          <div className="h-9 w-9 shrink-0 rounded flex items-center justify-center" style={{ background: `${line.color}18`, color: line.color }}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{line.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {data!.subs.length + data!.services.length} services · {data!.packages.length} pkg · {data!.assets.length} assets
                            </p>
                            <p className="text-xs font-mono text-solar mt-0.5">{money(data!.mrr)}/mo</p>
                          </div>
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          </div>
        </TabsContent>

        <ServiceDetailDialog detail={serviceDetail} onClose={() => setServiceDetail(null)} />
        <TabsContent value="services" className="mt-4">
          <div className="space-y-4">
            {serviceLineGroups.length === 0 && (
              <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
                No services yet. Assign an IMT package from the Packages tab.
              </CardContent></Card>
            )}
            {serviceLineGroups.map(({ line, data }) => {
              const Icon = line.icon;
              return (
                <Card key={line.key}>
                  <CardHeader className="flex flex-row items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded flex items-center justify-center" style={{ background: `${line.color}18`, color: line.color }}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="font-display text-base">{line.label}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          {data!.subs.length} subscription{data!.subs.length === 1 ? "" : "s"} ·{" "}
                          {data!.services.length} service{data!.services.length === 1 ? "" : "s"} ·{" "}
                          {data!.assets.length} asset{data!.assets.length === 1 ? "" : "s"} ·{" "}
                          <span className="font-mono text-solar">{money(data!.mrr)}/mo</span>
                        </p>
                      </div>
                    </div>
                    <Link to={line.route} className="text-xs text-solar hover:underline inline-flex items-center gap-1">
                      Open module <ArrowRight className="h-3 w-3" />
                    </Link>
                  </CardHeader>
                  <CardContent className="p-0 divide-y border-t">
                    {data!.subs.map((s: any) => (
                      <button type="button" key={`sub-${s.id}`} onClick={() => setServiceDetail({ kind: "Subscription", title: s.plan_name, lineLabel: line.label, record: s })} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{s.plan_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Subscription · {s.billing_cycle || "monthly"}
                            {s.next_renewal ? ` · Renews ${new Date(s.next_renewal).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-mono">{money(Number(s.amount) || 0, s.currency || "USD")}</span>
                          <StatusPill tone={serviceStatusTone(s.status)}>{s.status}</StatusPill>
                        </div>
                      </button>
                    ))}
                    {data!.services.map((s: any) => (
                      <button type="button" key={`svc-${s.id}`} onClick={() => setServiceDetail({ kind: "Service", title: s.service_name, lineLabel: line.label, record: s })} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{s.service_name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.service_type} · {s.vendor || "—"} · {s.plan || "—"}
                            {s.renewal_date ? ` · Renews ${new Date(s.renewal_date).toLocaleDateString()}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-mono">{money(Number(s.monthly_cost) || 0)}/mo</span>
                          <StatusPill tone={serviceStatusTone(s.status)}>{s.status}</StatusPill>
                        </div>
                      </button>
                    ))}
                    {data!.packages.map((p: any) => (
                      <button type="button" key={`pkg-${p.id}`} onClick={() => setServiceDetail({ kind: "Package", title: p.catalog?.name || "Package", lineLabel: line.label, record: p })} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{p.catalog?.name || "Package"}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Assigned package · {p.catalog?.code || p.catalog?.category || ""}
                            {p.quantity ? ` · Qty ${p.quantity}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {p.unit_price != null && <span className="text-sm font-mono">{money(Number(p.unit_price) || 0, p.currency || "USD")}</span>}
                          <StatusPill tone={serviceStatusTone(p.status)}>{p.status || "active"}</StatusPill>
                        </div>
                      </button>
                    ))}
                    {data!.assets.map((a: any) => (
                      <button type="button" key={`asset-${a.id}`} onClick={() => setServiceDetail({ kind: "Asset", title: a.name || a.asset_type, lineLabel: line.label, record: a })} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{a.name || a.asset_type}</p>
                          <p className="text-xs text-muted-foreground truncate">Asset · {a.model || a.serial_number || a.asset_type}</p>
                        </div>
                        <StatusPill tone={serviceStatusTone(a.status)}>{a.status || "in use"}</StatusPill>
                      </button>
                    ))}
                    {data!.credentials.map((c: any) => (
                      <button type="button" key={`cred-${c.id}`} onClick={() => setServiceDetail({ kind: "Credential", title: c.name, lineLabel: line.label, record: c })} className="w-full text-left p-3 flex items-center justify-between gap-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{c.name}</p>
                          <p className="text-xs text-muted-foreground truncate">Credential · {c.system || c.category || "vault entry"}</p>
                        </div>
                        {c.expires_at && <span className="text-xs text-muted-foreground">Expires {new Date(c.expires_at).toLocaleDateString()}</span>}
                      </button>
                    ))}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>


        <TabsContent value="services-mgmt" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <CardTitle className="font-display flex items-center gap-2"><Settings2 className="h-4 w-4 text-solar" />Services Management</CardTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{visibleSubs.length} of {subscriptions.length}</span>
                <Button size="sm" variant="outline" onClick={exportSubsCsv} disabled={visibleSubs.length === 0}>
                  <FileText className="h-3.5 w-3.5 mr-1" />Export CSV
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {subscriptions.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2 px-4 py-3 border-b bg-muted/20">
                  <Input placeholder="Search plan…" value={svcFilters.q} onChange={(e) => setSvcFilters({ ...svcFilters, q: e.target.value })} className="h-8 col-span-2" />
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.status} onChange={(e) => setSvcFilters({ ...svcFilters, status: e.target.value as any })}>
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="paused">Suspended</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.tier} onChange={(e) => setSvcFilters({ ...svcFilters, tier: e.target.value as any })}>
                    <option value="all">All tiers</option>
                    <option value="platinum">Platinum</option>
                    <option value="gold">Gold</option>
                    <option value="silver">Silver</option>
                    <option value="bronze">Bronze</option>
                  </select>
                  <div className="flex items-center gap-1 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground">Start</span>
                    <Input type="date" value={svcFilters.startFrom} onChange={(e) => setSvcFilters({ ...svcFilters, startFrom: e.target.value })} className="h-8 text-xs" />
                    <Input type="date" value={svcFilters.startTo} onChange={(e) => setSvcFilters({ ...svcFilters, startTo: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-1 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground">Renew</span>
                    <Input type="date" value={svcFilters.renewFrom} onChange={(e) => setSvcFilters({ ...svcFilters, renewFrom: e.target.value })} className="h-8 text-xs" />
                    <Input type="date" value={svcFilters.renewTo} onChange={(e) => setSvcFilters({ ...svcFilters, renewTo: e.target.value })} className="h-8 text-xs" />
                  </div>
                  <div className="flex items-center gap-2 col-span-2">
                    <span className="text-[10px] uppercase text-muted-foreground whitespace-nowrap">Min health {svcFilters.minHealth}</span>
                    <input type="range" min={0} max={100} step={5} value={svcFilters.minHealth} onChange={(e) => setSvcFilters({ ...svcFilters, minHealth: Number(e.target.value) })} className="w-full" />
                  </div>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.sortBy} onChange={(e) => setSvcFilters({ ...svcFilters, sortBy: e.target.value as any })}>
                    <option value="next_renewal">Sort: Renews</option>
                    <option value="started_on">Sort: Started</option>
                    <option value="amount">Sort: Amount</option>
                    <option value="health">Sort: Health</option>
                    <option value="plan_name">Sort: Name</option>
                  </select>
                  <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={svcFilters.sortDir} onChange={(e) => setSvcFilters({ ...svcFilters, sortDir: e.target.value as any })}>
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                  <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setSvcFilters({ q: "", status: "all", tier: "all", startFrom: "", startTo: "", renewFrom: "", renewTo: "", minHealth: 0, sortBy: "next_renewal", sortDir: "asc" })}>Reset</Button>
                </div>
              )}
              {subscriptions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">
                  No services yet. <Link to="/finance" className="text-solar font-semibold">Add one →</Link>
                </p>
              )}
              {subscriptions.length > 0 && visibleSubs.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-12">No services match the current filters.</p>
              )}
              {visibleSubs.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground border-b">
                      <tr>
                        <th className="text-left px-4 py-2">Service</th>
                        <th className="text-left px-4 py-2">Tier</th>
                        <th className="text-left px-4 py-2">Cycle</th>
                        <th className="text-left px-4 py-2">Started</th>
                        <th className="text-left px-4 py-2">Renews</th>
                        <th className="text-right px-4 py-2">Amount</th>
                        <th className="text-left px-4 py-2">Health</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-right px-4 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {visibleSubs.map((s: any) => {

                        const h = subHealth(s);
                        const active = s.status === "active";
                        const suspended = s.status === "paused";
                        const cancelled = s.status === "cancelled";
                        return (
                          <tr key={s.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3">
                              <p className="font-semibold">{s.plan_name}</p>
                              {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                            </td>
                            <td className="px-4 py-3"><StatusPill tone={s._tier === "platinum" ? "solar" : s._tier === "gold" ? "warning" : s._tier === "silver" ? "info" : "neutral"}>{s._tier}</StatusPill></td>
                            <td className="px-4 py-3 capitalize">{s.billing_cycle || "—"}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">{s.started_on || "—"}</td>
                            <td className="px-4 py-3 text-xs">{s.next_renewal || "—"}</td>
                            <td className="px-4 py-3 text-right font-mono">{money(s.amount, s.currency)}</td>
                            <td className="px-4 py-3"><StatusPill tone={h.tone}>{h.label} · {s._score}</StatusPill></td>

                            <td className="px-4 py-3"><StatusPill tone={serviceStatusTone(s.status)}>{s.status}</StatusPill></td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="outline" onClick={() => invoiceFromSub.mutate(s.id)} disabled={invoiceFromSub.isPending || cancelled}>
                                  <Receipt className="h-3.5 w-3.5 mr-1" />Invoice
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => subAction.mutate({ subscription_id: s.id, action: "renew" })} disabled={subAction.isPending || cancelled}>
                                  <RefreshCw className="h-3.5 w-3.5 mr-1" />Renew
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="sm" variant="outline"><MoreHorizontal className="h-3.5 w-3.5" /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => { setEditForm({ plan_name: s.plan_name, description: s.description || "", amount: Number(s.amount) || 0, billing_cycle: s.billing_cycle || "monthly" }); setEditSub({ sub: s, mode: "upgrade" }); }}>
                                      <ArrowUpCircle className="h-4 w-4 mr-2 text-success" />Upgrade
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => { setEditForm({ plan_name: s.plan_name, description: s.description || "", amount: Number(s.amount) || 0, billing_cycle: s.billing_cycle || "monthly" }); setEditSub({ sub: s, mode: "downgrade" }); }}>
                                      <ArrowDownCircle className="h-4 w-4 mr-2 text-warning" />Downgrade
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    {suspended ? (
                                      <DropdownMenuItem onClick={() => subAction.mutate({ subscription_id: s.id, action: "resume" })}>
                                        <PlayCircle className="h-4 w-4 mr-2 text-success" />Resume
                                      </DropdownMenuItem>
                                    ) : (
                                      <DropdownMenuItem onClick={() => subAction.mutate({ subscription_id: s.id, action: "suspend" })} disabled={cancelled}>
                                        <PauseCircle className="h-4 w-4 mr-2 text-warning" />Suspend
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => { if (confirm(`Cancel subscription "${s.plan_name}"?`)) subAction.mutate({ subscription_id: s.id, action: "cancel" }); }}
                                      disabled={cancelled}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <XCircle className="h-4 w-4 mr-2" />Cancel
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Dialog open={!!editSub} onOpenChange={(o) => !o && setEditSub(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="capitalize flex items-center gap-2">
                  {editSub?.mode === "upgrade" ? <ArrowUpCircle className="h-4 w-4 text-success" /> : <ArrowDownCircle className="h-4 w-4 text-warning" />}
                  {editSub?.mode} — {editSub?.sub?.plan_name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1"><Label>Plan name</Label><Input value={editForm.plan_name} onChange={(e) => setEditForm({ ...editForm, plan_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Description</Label><Input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><Label>Amount</Label><Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label>Billing cycle</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm" value={editForm.billing_cycle} onChange={(e) => setEditForm({ ...editForm, billing_cycle: e.target.value })}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="yearly">Yearly</option>
                    </select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditSub(null)}>Cancel</Button>
                <Button
                  className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}
                  onClick={() => {
                    if (!editSub) return;
                    subAction.mutate({
                      subscription_id: editSub.sub.id,
                      action: editSub.mode,
                      plan_name: editForm.plan_name,
                      description: editForm.description,
                      amount: editForm.amount,
                      billing_cycle: editForm.billing_cycle,
                    });
                    setEditSub(null);
                  }}
                >Apply {editSub?.mode}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>



        <TabsContent value="packages" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {packages.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No packages assigned yet. Assign from the <Link to="/catalog" className="text-solar underline">catalog</Link> or during onboarding.
              </p>
            )}
            {packages.map((p: any) => {
              const cat = p.catalog || {};
              const line = Number(p.quantity || 1) * Number(p.unit_price || 0);
              return (
                <div key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-semibold text-solar bg-solar/10 px-2 py-0.5 rounded">{cat.code || "—"}</span>
                      <span className="font-semibold truncate">{cat.name || "Package"}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{cat.category || "—"} · {cat.billing_cycle || "monthly"} · qty {p.quantity}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-sm font-mono">{money(line, cat.currency || "USD")}</span>
                    <StatusPill tone={serviceStatusTone(p.status)}>{p.status}</StatusPill>
                  </div>
                </div>
              );
            })}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="subscriptions" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {subscriptions.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No subscriptions.</p>}
            {subscriptions.map((s: any) => (
              <div key={s.id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{s.plan_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.description || "—"} · {s.billing_cycle} · Renews {s.next_renewal || "—"}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-mono">{money(s.amount, s.currency)}</span>
                  <StatusPill tone={serviceStatusTone(s.status)}>{s.status}</StatusPill>
                  <Button size="sm" variant="outline" onClick={() => invoiceFromSub.mutate(s.id)} disabled={invoiceFromSub.isPending}>
                    <Receipt className="h-3.5 w-3.5 mr-1" />Invoice
                  </Button>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="transactions" className="mt-4">
          <AccountTransactions view={view} />
        </TabsContent>

        <TabsContent value="invoices" className="mt-4">
          <CustomerSalesDesk customer={customer} invoices={invoices} mode="invoices" />
        </TabsContent>

        <TabsContent value="payments" className="mt-4">
          <CustomerPendingPayments customerId={customer.id} />
          {(() => {
            const real = (payments as any[]).filter((p) => p.method !== "account_credit");
            const total = real.reduce((s, p) => s + Number(p.amount || 0), 0);
            const cash = real.filter((p) => p.method === "cash").reduce((s, p) => s + Number(p.amount || 0), 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                <KpiTile icon={DollarSign} label="Total Paid" value={money(total)} tone="success" />
                <KpiTile icon={DollarSign} label="Cash Received" value={money(cash)} tone="info" />
                <KpiTile icon={Receipt} label="Payments" value={real.length} tone="info" />
                <KpiTile icon={CalendarClock} label="Last Payment" value={real[0] ? new Date(real[0].paid_at).toLocaleDateString() : "—"} tone="info" />
              </div>
            );
          })()}
          <Card><CardContent className="p-0 divide-y">
            {payments.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No payments recorded.</p>}
            {payments.map((p: any) => (
              <div key={p.id} className="p-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-semibold">{p.receipt_number || "—"}</p>
                  <p className="text-xs text-muted-foreground">{new Date(p.paid_at).toLocaleString()} · {String(p.method || "").replace("_", " ")} · {p.reference || "no ref"}</p>
                  {(p.service_context || p.invoice_id) && (
                    <p className="text-xs mt-0.5">
                      {p.service_context && <span className="font-medium">For: {p.service_context}</span>}
                      {p.invoice_id && <span className="text-muted-foreground"> · {(invoices as any[]).find((i) => i.id === p.invoice_id)?.invoice_number ?? "Invoice"}</span>}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono">{money(p.amount, p.currency)}</span>
                  <StatusPill tone={p.reconciliation_status === "matched" ? "success" : p.reconciliation_status === "partial" ? "info" : "neutral"}>
                    {p.reconciliation_status || p.status}
                  </StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="quotes" className="mt-4">
          <CustomerSalesDesk customer={customer} quotes={quotes} />
        </TabsContent>

        <TabsContent value="assets" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {assets.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No assets assigned. <Link to="/inventory" className="text-solar font-semibold">Add asset →</Link>
              </p>
            )}
            {assets.map((a: any) => (
              <Link key={a.id} to="/assets/$id" params={{ id: a.id }} className="p-4 flex items-center justify-between hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-info/15 text-info flex items-center justify-center"><Laptop className="h-4 w-4" /></div>
                  <div>
                    <p className="font-semibold">{a.name || a.asset_tag}</p>
                    <p className="text-xs text-muted-foreground">{a.asset_tag} · SN {a.serial_number || "—"}</p>
                  </div>
                </div>
                <StatusPill tone={serviceStatusTone(a.status)}>{a.status}</StatusPill>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="tickets" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {tickets.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No tickets for this customer.</p>}
            {tickets.map((t: any) => (
              <Link key={t.id} to="/tickets/$id" params={{ id: t.id }} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                <div><p className="font-semibold"><span className="font-mono text-xs text-muted-foreground mr-2">{t.ticket_number}</span>{t.subject}</p><p className="text-xs text-muted-foreground mt-0.5">{new Date(t.created_at).toLocaleString()}</p></div>
                <div className="flex gap-2"><StatusPill tone={t.priority === "critical" ? "danger" : "info"}>{t.priority}</StatusPill><StatusPill tone="neutral">{t.status}</StatusPill></div>
              </Link>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="licences" className="mt-4"><ClientLicensesPanel customerId={customer.id} /></TabsContent>

        <TabsContent value="renewals" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {renewals.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No upcoming renewals in the next 120 days.</p>}
            {renewals.map((r, i) => (
              <div key={i} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-md bg-solar/15 text-solar flex items-center justify-center"><CalendarClock className="h-4 w-4" /></div>
                  <div>
                    <p className="font-semibold">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.kind} · Due {new Date(r.date).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {r.amount != null && <span className="text-sm font-mono">{money(r.amount, r.currency || "USD")}</span>}
                  <StatusPill tone={r.daysLeft < 0 ? "danger" : r.daysLeft <= 7 ? "danger" : r.daysLeft <= 30 ? "warning" : "info"}>
                    {r.daysLeft < 0 ? `${Math.abs(r.daysLeft)}d overdue` : `${r.daysLeft}d left`}
                  </StatusPill>
                </div>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="contacts" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if (!contactForm.name) return; addContact.mutate(); }} className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <Input placeholder="Name *" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} required />
              <Input placeholder="Role" value={contactForm.role} onChange={(e) => setContactForm({ ...contactForm, role: e.target.value })} />
              <Input placeholder="Email" type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} />
              <Input placeholder="Phone" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} />
              <Button type="submit" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1" />Add</Button>
            </form>
            <div className="divide-y">
              {contacts.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No contacts yet.</p>}
              {contacts.map((c: any) => (
                <div key={c.id} className="py-3 flex items-center justify-between">
                  <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.role || "—"} · {c.email || "—"} · {c.phone || "—"}</p></div>
                  <StatusPill tone="neutral">{c.contact_type}</StatusPill>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="credentials" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {credentials.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No credentials linked yet. <Link to="/techops/vault" className="text-solar font-semibold">Add one →</Link></p>}
            {credentials.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between p-4">
                <div><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">{c.credential_type}{c.username ? ` · ${c.username}` : ""}</p></div>
                <span className="text-xs text-muted-foreground">{c.expires_at ? `Expires ${new Date(c.expires_at).toLocaleDateString()}` : "No expiry"}</span>
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="comms" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {communications.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-12">
                No communications logged yet. <Link to="/communications" className="text-solar font-semibold">Log one →</Link>
              </p>
            )}
            {communications.map((c: any) => (
              <div key={c.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusPill tone="info">{c.type || c.channel || "note"}</StatusPill>
                    <p className="font-semibold">{c.subject || c.title || "—"}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.occurred_at ? new Date(c.occurred_at).toLocaleString() : new Date(c.created_at).toLocaleString()}</span>
                </div>
                {c.body && <p className="text-sm text-muted-foreground mt-2">{c.body}</p>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="p-0 divide-y">
            {timeline.length === 0 && <p className="text-sm text-muted-foreground text-center py-12">No timeline events.</p>}
            {timeline.map((e: any) => (
              <div key={e.id} className="p-4">
                <div className="flex justify-between">
                  <p className="font-semibold">{e.title || e.event_type}</p>
                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                {e.description && <p className="text-sm text-muted-foreground mt-1">{e.description}</p>}
              </div>
            ))}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card><CardContent className="p-6 space-y-4">
            <form onSubmit={(e) => { e.preventDefault(); if (noteBody.trim()) addNote.mutate(); }} className="space-y-2">
              <Label>Add note</Label>
              <Textarea rows={3} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Quick note about this customer…" />
              <Button type="submit" disabled={addNote.isPending} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>Save note</Button>
            </form>
            <div className="space-y-3">
              {notes.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
              {notes.map((n: any) => (
                <div key={n.id} className="p-3 rounded-md border border-border">
                  <p className="text-sm">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
        </div>
      </Tabs>
    </div></PageContainer>

  );
}

function QuickBtn({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) {
  return (
    <Button asChild size="sm" variant="outline" className="bg-white/10 text-navy-foreground border-white/20 hover:bg-white/20 hover:text-navy-foreground">
      <Link to={to as any}><Icon className="h-4 w-4 mr-1.5" />{children}</Link>
    </Button>
  );
}

function QuickJump({ to, icon: Icon, children }: { to: string; icon: any; children: React.ReactNode }) {
  return (
    <Link to={to as any} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md hover:bg-muted transition-colors">
      <Icon className="h-4 w-4 text-solar" />
      <span>{children}</span>
    </Link>
  );
}

function SideRow({ icon: Icon, label, value, href }: { icon: any; label: string; value?: string | null; href?: string }) {
  const content = value || "—";
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        {href && value ? (
          <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-sm text-solar hover:underline truncate block">{content}</a>
        ) : (
          <p className="text-sm truncate">{content}</p>
        )}
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-4"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>;
}

function KpiTile({ icon: Icon, label, value, tone = "info" }: { icon: any; label: string; value: number | string; tone?: "info" | "success" | "warning" | "danger" }) {
  const toneMap: Record<string, string> = {
    info: "bg-info/15 text-info",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-[oklch(0.45_0.13_75)]",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <Card><CardContent className="p-5">
      <div className="flex items-start justify-between">
        <div><p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{label}</p><p className="font-display text-2xl font-bold mt-2 tabular-nums">{value}</p></div>
        <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${toneMap[tone]}`}><Icon className="h-4 w-4" /></div>
      </div>
    </CardContent></Card>
  );
}

function MetaRow({ label, value, pill }: { label: string; value: React.ReactNode; pill?: boolean }) {
  return (
    <>
      <div className="text-muted-foreground">{label}:</div>
      <div className="text-right font-medium">
        {pill ? <span className="inline-flex items-center px-2 py-0.5 bg-solar/15 text-solar text-[10px] font-semibold">{value}</span> : value}
      </div>
    </>
  );
}

function StatChip({ label, value, color, text }: { label: string; value: string; color: string; text: string }) {
  return (
    <div className="p-4 border border-border flex flex-col items-center justify-center text-center" style={{ backgroundColor: color, color: text }}>
      <p className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</p>
      <p className="font-display font-bold text-xl mt-1 tabular-nums">{value}</p>
    </div>
  );
}

function InfoRow({ label, value, sub, link }: { label: string; value: React.ReactNode; sub?: string | null; link?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-dashed border-border pb-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <div className="text-right min-w-0">
        <p className={`text-sm font-medium truncate ${link ? "text-solar" : ""}`}>{value || "—"}</p>
        {sub && <p className="text-[11px] text-muted-foreground truncate">{sub}</p>}
      </div>
    </div>
  );
}

function ActionBtn({ tone, icon: Icon, label, onClick }: { tone: "indigo" | "amber" | "emerald" | "sky" | "rose" | "slate" | "violet"; icon: any; label: string; onClick?: () => void }) {
  const map: Record<string, string> = {
    indigo: "bg-[oklch(0.55_0.18_265)] hover:bg-[oklch(0.5_0.18_265)] text-white",
    violet: "bg-[oklch(0.55_0.2_300)] hover:bg-[oklch(0.5_0.2_300)] text-white",
    amber: "bg-[oklch(0.75_0.16_75)] hover:bg-[oklch(0.7_0.16_75)] text-[oklch(0.25_0.08_75)]",
    emerald: "bg-[oklch(0.6_0.15_150)] hover:bg-[oklch(0.55_0.15_150)] text-white",
    sky: "bg-[oklch(0.6_0.14_240)] hover:bg-[oklch(0.55_0.14_240)] text-white",
    rose: "bg-[oklch(0.6_0.2_20)] hover:bg-[oklch(0.55_0.2_20)] text-white",
    slate: "bg-[oklch(0.4_0.03_265)] hover:bg-[oklch(0.35_0.03_265)] text-white",
  };
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition ${map[tone]}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

/* ============================================================================
 * IspHeroPane — pixel-matched ISP hero, every value dynamic.
 * ==========================================================================*/
type Chip = { label: string; value: string | number; color: string; text: string };

function ispChips(view: Customer360View): Chip[] {
  const chips: Chip[] = [];
  const s = view.stats;
  const server = view.cloudServers[0] as any;
  const host = view.webHosting[0] as any;
  const nas = view.managedNas[0] as any;
  const store = view.cloudStorage[0] as any;
  if (server && (server.vcpu ?? server.cpu)) {
    chips.push({ label: "vCPU CORES", value: server.vcpu ?? server.cpu, color: "#7c3aed", text: "#ffffff" });
  } else if (host && host.disk_quota_gb) {
    chips.push({ label: "DISK QUOTA", value: `${host.disk_quota_gb} GB`, color: "#7c3aed", text: "#ffffff" });
  } else if (store && (store.capacity_gb ?? store.storage_gb)) {
    chips.push({ label: "STORAGE", value: `${store.capacity_gb ?? store.storage_gb} GB`, color: "#7c3aed", text: "#ffffff" });
  } else if (nas && (nas.capacity_gb ?? nas.total_capacity_gb)) {
    chips.push({ label: "NAS CAPACITY", value: `${nas.capacity_gb ?? nas.total_capacity_gb} GB`, color: "#7c3aed", text: "#ffffff" });
  } else if (view.starlink.length) {
    chips.push({ label: "STARLINK KITS", value: view.starlink.length, color: "#7c3aed", text: "#ffffff" });
  } else if (view.assets.length) {
    chips.push({ label: "ASSIGNED ASSETS", value: view.assets.length, color: "#7c3aed", text: "#ffffff" });
  } else {
    chips.push({ label: "QUOTATIONS", value: (view.quotes as any[]).length, color: "#7c3aed", text: "#ffffff" });
  }

  if (view.cloudServers.length) {
    chips.push({ label: "SERVERS RUNNING", value: `${s.activeServers}/${view.cloudServers.length}`, color: "#2563eb", text: "#ffffff" });
  } else if (view.monitoringChecks.length) {
    chips.push({ label: "MONITORS UP", value: `${s.monitorsUp}/${view.monitoringChecks.length}`, color: "#2563eb", text: "#ffffff" });
  } else if (view.webHosting.length) {
    chips.push({ label: "HOSTING ACCOUNTS", value: view.webHosting.length, color: "#2563eb", text: "#ffffff" });
  } else if (s.activeSubscriptions > 0) {
    chips.push({ label: "SUBSCRIPTIONS", value: s.activeSubscriptions, color: "#2563eb", text: "#ffffff" });
  } else {
    chips.push({ label: "INVOICES", value: (view.invoices as any[]).length, color: "#2563eb", text: "#ffffff" });
  }

  const nextR = collectRenewals(view, 365)[0];
  if (nextR) {
    chips.push({ label: "EXPIRATION", value: new Date(nextR.date).toLocaleDateString(), color: "#ea580c", text: "#ffffff" });
  } else if ((view.customer as any)?.contract_end_date) {
    chips.push({ label: "CONTRACT ENDS", value: new Date((view.customer as any).contract_end_date).toLocaleDateString(), color: "#ea580c", text: "#ffffff" });
  } else {
    chips.push({ label: "CONTACTS", value: view.contacts.length, color: "#ea580c", text: "#ffffff" });
  }

  const credit = Number((view.customer as any)?.credit_balance || 0);
  if (credit > 0) {
    chips.push({ label: "CREDIT", value: money(credit), color: "#0d9488", text: "#ffffff" });
  } else if (view.starlink.length || view.voip.length) {
    chips.push({ label: "PREPAID SERVICES", value: view.starlink.length + view.voip.length, color: "#0d9488", text: "#ffffff" });
  } else {
    const openQuotes = (view.quotes as any[]).filter((q) => ["draft", "sent", "viewed"].includes(String(q.status))).length;
    chips.push({ label: "OPEN QUOTES", value: openQuotes, color: "#0d9488", text: "#ffffff" });
  }

  const cutoff = Date.now() - 90 * 86400000;
  const paid90 = (view.payments as any[])
    .filter((p) => p.paid_at && new Date(p.paid_at).getTime() >= cutoff)
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  chips.push({ label: "PAID (90d)", value: money(paid90), color: "#10b981", text: "#ffffff" });

  const totalInvoiced = (view.invoices as any[])
    .filter((i) => !["void", "cancelled", "draft"].includes(String(i.status)))
    .reduce((sum, i) => sum + Number(i.total || 0), 0);
  chips.push({ label: "TOTAL INVOICED", value: money(totalInvoiced), color: "#dc2626", text: "#ffffff" });
  return chips;
}

function ispQuickInfo(view: Customer360View): Array<{ label: string; value: string; sub?: string }> {
  const rows: Array<{ label: string; value: string; sub?: string }> = [];
  const primarySub = (view.subscriptions as any[]).find((s) => s.status === "active") || (view.subscriptions as any[])[0];
  if (primarySub?.plan_name) rows.push({ label: "Primary Package", value: primarySub.plan_name, sub: primarySub.description || undefined });
  if (primarySub?.billing_cycle) rows.push({ label: "Billing Cycle", value: primarySub.billing_cycle });
  if (primarySub?.next_renewal) rows.push({ label: "Next Renewal", value: new Date(primarySub.next_renewal).toLocaleDateString() });

  const server = view.cloudServers[0] as any;
  const host = view.webHosting[0] as any;
  const star = view.starlink[0] as any;
  const voip = view.voip[0] as any;
  if (server) {
    if (server.hostname || server.name) rows.push({ label: "Primary Server", value: server.hostname || server.name, sub: server.public_ip || undefined });
    if (server.provider) rows.push({ label: "Cloud Provider", value: server.provider });
    if (server.os) rows.push({ label: "Operating System", value: server.os });
  } else if (host) {
    if (host.domain) rows.push({ label: "Primary Domain", value: host.domain });
    if (host.control_panel) rows.push({ label: "Control Panel", value: host.control_panel });
  } else if (star) {
    if (star.kit_serial) rows.push({ label: "Starlink Kit", value: star.kit_serial });
    if (star.terminal_id) rows.push({ label: "Terminal ID", value: star.terminal_id });
    if (star.plan_type) rows.push({ label: "Starlink Plan", value: star.plan_type });
  } else if (voip) {
    if (voip.sip_username) rows.push({ label: "SIP Username", value: voip.sip_username });
    if (voip.did_number || voip.number) rows.push({ label: "DID Number", value: voip.did_number || voip.number });
  }

  const lastPay = (view.payments as any[])[0];
  if (lastPay?.paid_at) rows.push({ label: "Last Payment", value: new Date(lastPay.paid_at).toLocaleDateString(), sub: `${lastPay.currency || "USD"} ${Number(lastPay.amount || 0).toFixed(2)}` });

  const c = view.customer as any;
  if (view.contacts.length) rows.push({ label: "Contacts on File", value: String(view.contacts.length) });
  if (c?.account_number) rows.push({ label: "Subscriber Code", value: c.account_number });
  return rows;
}

function IspHeroPane(props: {
  view: Customer360View;
  stats: Customer360View["stats"];
  onLifecycle: (a: "suspend" | "resume") => void;
  onSendReminder: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const { view, stats, onLifecycle, onSendReminder, onEdit, onRefresh } = props;
  const customer = view.customer as any;
  const { roles } = useRoles();
  const salesPermissions = customerSalesPermissions(roles);
  const ctx: ClientContext = {
    customerId: customer.id,
    accountNumber: customer.account_number,
    companyName: customer.company_name,
    primaryEmail: customer.primary_email,
  };
  const [open, setOpen] = useState<null | "service" | "payment" | "quote" | "ticket" | "comm" | "tech" | "credit" | "cash">(null);
  const [ws, setWs] = useState<WorkspaceKind | null>(null);
  const wsCtx = {
    customerId: customer.id,
    accountNumber: customer.account_number,
    companyName: customer.company_name,
    primaryEmail: customer.primary_email,
    subscriptions: view.subscriptions ?? [],
  };

  const chips = useMemo(() => ispChips(view), [view]);
  const info = useMemo(() => ispQuickInfo(view), [view]);
  const suspended = customer?.status !== "active";

  const hasPrepaid = view.starlink.length > 0 || view.voip.length > 0;
  const hasCloud = view.cloudServers.length > 0;
  const hasOverdue = stats.openInvoiceTotal > 0;
  const slot5: { label: string; icon: any; onClick: () => void } =
    hasCloud
      ? { label: "Cloud Console", icon: Server, onClick: () => { window.location.href = "/cloud-ops"; } }
      : hasOverdue && hasPrepaid
        ? { label: "Send Reminder", icon: Bell, onClick: onSendReminder }
        : { label: "New Ticket", icon: LifeBuoy, onClick: () => setOpen("ticket") };


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {chips.slice(0, 3).map((c, i) => <StatChip key={`a${i}`} label={c.label} value={String(c.value)} color={c.color} text={c.text} />)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {chips.slice(3, 6).map((c, i) => <StatChip key={`b${i}`} label={c.label} value={String(c.value)} color={c.color} text={c.text} />)}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm font-display uppercase tracking-wider">Quick Information</CardTitle>
          <Button size="sm" variant="ghost" onClick={onRefresh}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh</Button>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 pt-0">
          {info.map((r, i) => <InfoRow key={i} label={r.label} value={r.value} sub={r.sub} />)}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <ActionBtn tone="violet"  icon={Plus}        label="Add Service"        onClick={() => setOpen("service")} />
        <ActionBtn tone="indigo"  icon={PackageIcon} label="Change Package"     onClick={() => setWs("package")} />
        <ActionBtn tone="slate"   icon={Wrench}      label="Assign Tech Team"   onClick={() => setOpen("tech")} />
        <ActionBtn tone="amber"   icon={RefreshCw}   label={hasPrepaid ? "Recharge" : "Send Reminder"} onClick={hasPrepaid ? (() => { window.location.href = view.starlink.length ? "/starlink" : "/voip"; }) : onSendReminder} />
        {salesPermissions.canQuote && <Button size="sm" variant="outline" asChild><Link to="/customers/$accountNumber" params={{ accountNumber: customer.account_number }} search={{ tab: "quotes" }} resetScroll={false}><FileCheck className="mr-1.5 h-4 w-4" />Quotations / Convert to invoice</Link></Button>}
        {salesPermissions.canRecordPayment && <ActionBtn tone="emerald" icon={DollarSign} label="Receive Payment" onClick={() => setOpen("cash")} />}
        {salesPermissions.canSubmitPayment && <ActionBtn tone="sky" icon={CreditCard} label="Submit Cash / Bank Payment" onClick={() => setOpen("payment")} />}
        {salesPermissions.canQuote && <ActionBtn tone="indigo" icon={FileCheck} label="New Quotation" onClick={() => setOpen("quote")} />}
        <ComposeEmailDialog
          accountNumber={customer.account_number}
          trigger={
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition bg-[oklch(0.6_0.14_200)] hover:bg-[oklch(0.55_0.14_200)] text-white">
              <Mail className="h-3.5 w-3.5" />
              Send Email
            </button>
          }
        />
        <ActionBtn tone="rose"    icon={slot5.icon}  label={slot5.label}        onClick={slot5.onClick} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold shadow-sm transition bg-[oklch(0.4_0.03_265)] hover:bg-[oklch(0.35_0.03_265)] text-white">
              <MoreHorizontal className="h-3.5 w-3.5" />
              Other Actions
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setOpen("quote")}><FileCheck className="h-4 w-4 mr-2" />New Quote</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("ticket")}><LifeBuoy className="h-4 w-4 mr-2" />New Ticket</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("comm")}><Mail className="h-4 w-4 mr-2" />Log Communication</DropdownMenuItem>
            <DropdownMenuItem onClick={onSendReminder}><Bell className="h-4 w-4 mr-2" />Send Payment Reminder</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOpen("credit")}><DollarSign className="h-4 w-4 mr-2 text-teal-600" />Apply Credit (notify Billing)</DropdownMenuItem>
            <DropdownMenuSeparator />
            
            <DropdownMenuItem onClick={() => setWs("billing")}><CreditCard className="h-4 w-4 mr-2" />Billing</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("timeline")}><Activity className="h-4 w-4 mr-2" />Customer Timeline</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("comms")}><MailIcon className="h-4 w-4 mr-2" />Communication Center</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("kyc")}><ShieldCheck className="h-4 w-4 mr-2" />KYC Documents</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("equipment")}><Boxes className="h-4 w-4 mr-2" />Equipment &amp; Assets</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setWs("contract")}><FileText className="h-4 w-4 mr-2" />Generate Contract</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("refund")}><Receipt className="h-4 w-4 mr-2" />Refund</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("statement")}><FileCheck className="h-4 w-4 mr-2" />Print Statement</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("export")}><Send className="h-4 w-4 mr-2" />Download Customer Profile</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 mr-2" />Edit Details</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("resume")}><PlayCircle className="h-4 w-4 mr-2 text-success" />Resume Service</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("suspend")} className="text-destructive focus:text-destructive"><PauseCircle className="h-4 w-4 mr-2" />Suspend Service</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWs("cancel")} className="text-destructive focus:text-destructive"><XCircle className="h-4 w-4 mr-2" />Cancel Service</DropdownMenuItem>
            <DropdownMenuSeparator />
            {suspended ? (
              <DropdownMenuItem onClick={() => onLifecycle("resume")}><PlayCircle className="h-4 w-4 mr-2 text-success" />Resume Account</DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => { if (confirm(`Suspend ${customer.company_name}?`)) onLifecycle("suspend"); }} className="text-destructive focus:text-destructive"><PauseCircle className="h-4 w-4 mr-2" />Suspend Account</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {open === "service" && <AddServiceDialog ctx={ctx} onClose={() => setOpen(null)} />}
      <SubmitPaymentDialog open={open === "payment"} onOpenChange={(v) => setOpen(v ? "payment" : null)} customerId={customer.id} />
      {open === "cash"    && <RecordPaymentDialog ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "quote" && <QuoteBuilderDialog open onOpenChange={(v) => { if (!v) setOpen(null); }} customers={[customer]} defaultCustomerId={customer.id} onSaved={onRefresh} />}
      {open === "ticket"  && <CreateTicketDialog  ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "comm"    && <LogCommDialog       ctx={ctx} onClose={() => setOpen(null)} />}
      {open === "tech"    && <AssignTechDialog    ctx={ctx} onClose={() => setOpen(null)} defaults={{ service_type: view.cloudServers.length ? "cloud" : view.voip.length ? "voip" : "general" }} />}
      {open === "credit"  && <ApplyCreditDialog   ctx={ctx} onClose={() => setOpen(null)} />}
      <CustomerTasksCard ctx={ctx} />

      {ws && <Customer360Workspace kind={ws} ctx={wsCtx} onClose={() => setWs(null)} />}
    </div>
  );
}

