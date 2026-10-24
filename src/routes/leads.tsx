import { useMemo, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { AccountPortfolio } from "@/components/account-portfolio";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listLeads, upsertLead, setLeadStatus, deleteLead, convertLeadToCustomer } from "@/lib/crm.functions";
import { LEAD_STATUSES } from "@/lib/service-tasks.shared";
import { useTechnicians } from "@/components/assign-tech-dialog";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, StatusBadge, toneForStatus,
  EmptyState, money, shortDate, type ColumnDef,
} from "@/components/enterprise";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreHorizontal, UserPlus, Trash2, Target } from "lucide-react";
import { TITLES } from "@/lib/titles";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads & Accounts Workspace — IMT CRM" },
      { name: "description", content: "Track prospects through the IMT sales pipeline and convert won leads into customer accounts." },
      { property: "og:title", content: "Leads — IMT CRM" },
      { property: "og:description", content: "Pipeline of prospects, follow-ups and conversions for IMT Solutions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LeadsPage,
  validateSearch: (s: Record<string, unknown>): { view?: string } => typeof s.view === "string" ? { view: s.view } : {},
});

const SOURCES = ["manual", "referral", "website", "call", "email", "walk_in", "campaign", "partner"];

const emptyForm = {
  id: undefined as string | undefined,
  company_name: "", contact_name: "", title: "", email: "", phone: "",
  source: "manual", status: "new", interest: "", estimated_value: 0,
  currency: "USD", assigned_to: "", next_follow_up: "", notes: "",
};

function LeadsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { view: workspace = "leads" } = Route.useSearch();
  const listFn = useServerFn(listLeads);
  const saveFn = useServerFn(upsertLead);
  const statusFn = useServerFn(setLeadStatus);
  const delFn = useServerFn(deleteLead);
  const convertFn = useServerFn(convertLeadToCustomer);
  const { data: staff = [] } = useTechnicians();

  const { data, isLoading } = useQuery({ queryKey: ["leads"], queryFn: () => listFn() });
  const leads = (data?.leads ?? []) as any[];
  const stats = data?.stats;

  const [tab, setTab] = useState("open");
  const [search, setSearch] = useState("");
  const [mine, setMine] = useState(true);
  const [form, setForm] = useState<typeof emptyForm | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["leads"] });

  const save = useMutation({
    mutationFn: async () => saveFn({
      data: {
        ...(form ?? emptyForm),
        estimated_value: Number(form?.estimated_value) || 0,
        assigned_to: form?.assigned_to || null,
        next_follow_up: form?.next_follow_up || null,
      },
    }),
    onSuccess: () => { toast.success("Lead saved"); refresh(); setForm(null); },
    onError: (e: any) => toast.error(e?.message || "Failed to save lead"),
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: string; status: string }) => statusFn({ data: v }),
    onSuccess: () => { toast.success("Lead status updated"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Lead deleted"); refresh(); },
    onError: (e: any) => toast.error(e?.message || "Failed"),
  });

  const convert = useMutation({
    mutationFn: async (id: string) => convertFn({ data: { id } }),
    onSuccess: (res: any) => {
      toast.success(`Customer ${res.customer.account_number} created`);
      refresh();
      navigate({ to: "/customers/$accountNumber", params: { accountNumber: res.customer.account_number } });
    },
    onError: (e: any) => toast.error(e?.message || "Conversion failed"),
  });

  const filtered = useMemo(() => {
    const s = search.toLowerCase().trim();
    return leads.filter((l) => {
      if (mine && l.assigned_to !== user?.id && !(l.created_by === user?.id && !l.assigned_to)) return false;
      if (tab === "open" && ["won", "lost"].includes(l.status)) return false;
      if (tab === "won" && l.status !== "won") return false;
      if (tab === "lost" && l.status !== "lost") return false;
      if (tab === "followup" && !(l.next_follow_up && new Date(l.next_follow_up).getTime() <= Date.now())) return false;
      if (!s) return true;
      return [l.company_name, l.contact_name, l.email, l.phone, l.interest, l.status]
        .some((f) => String(f ?? "").toLowerCase().includes(s));
    });
  }, [leads, tab, search, mine, user?.id]);

  const chips = [
    { label: "OPEN LEADS", value: String(stats?.open ?? 0), color: "#2563eb" },
    { label: "PIPELINE", value: money(stats?.pipelineValue ?? 0), color: "#7c3aed" },
    { label: "WON", value: String(stats?.won ?? 0), color: "#10b981" },
    { label: "WON VALUE", value: money(stats?.wonValue ?? 0), color: "#0891b2" },
    { label: "FOLLOW-UPS DUE", value: String(stats?.followUpsDue ?? 0), color: "#f59e0b" },
    { label: "LOST", value: String(stats?.lost ?? 0), color: "#dc2626" },
  ];

  const columns: ColumnDef<any>[] = [
    { header: "Company", cell: (r: any) => (
      <div>
        <div className="font-medium">{r.company_name}</div>
        <div className="text-xs text-muted-foreground">{[r.title, r.contact_name].filter(Boolean).join(" ") || "—"}</div>
      </div>
    ) },
    { header: "Contact", cell: (r: any) => (
      <div className="text-xs">
        <div>{r.email || "—"}</div>
        <div className="text-muted-foreground">{r.phone || ""}</div>
      </div>
    ) },
    { header: "Interest", cell: (r: any) => r.interest || "—" },
    { header: "Source", cell: (r: any) => String(r.source ?? "").replace(/_/g, " ") },
    { header: "Value", cell: (r: any) => money(r.estimated_value, r.currency) },
    { header: "Follow-up", cell: (r: any) => (r.next_follow_up ? shortDate(r.next_follow_up) : "—") },
    { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
    { header: "", cell: (r: any) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost"><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setForm({
            id: r.id, company_name: r.company_name, contact_name: r.contact_name ?? "", title: r.title ?? "",
            email: r.email ?? "", phone: r.phone ?? "", source: r.source ?? "manual", status: r.status,
            interest: r.interest ?? "", estimated_value: Number(r.estimated_value ?? 0), currency: r.currency ?? "USD",
            assigned_to: r.assigned_to ?? "", next_follow_up: r.next_follow_up ?? "", notes: r.notes ?? "",
          })}>Edit lead</DropdownMenuItem>
          <DropdownMenuSeparator />
          {LEAD_STATUSES.filter((s) => s !== r.status).map((s) => (
            <DropdownMenuItem key={s} onClick={() => setStatus.mutate({ id: r.id, status: s })}>
              Mark as {s}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          {r.converted_customer_id ? (
            <DropdownMenuItem onClick={() => navigate({ to: "/customers/$accountNumber", params: { accountNumber: r.customer?.account_number } })}>
              Open customer {r.customer?.account_number}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => convert.mutate(r.id)}>
              <UserPlus className="h-4 w-4 mr-2" />Convert to customer
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-destructive focus:text-destructive"
            onClick={() => { if (confirm(`Delete lead ${r.company_name}?`)) remove.mutate(r.id); }}>
            <Trash2 className="h-4 w-4 mr-2" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) },
  ];

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Account Management"
        title="Leads & Accounts"
        actions={<><Button asChild variant="outline"><Link to="/customers/new"><UserPlus className="h-4 w-4 mr-1.5" />New account</Link></Button><Button onClick={() => setForm({ ...emptyForm, assigned_to: user?.id ?? "" })}><Plus className="h-4 w-4 mr-1.5" />New Lead</Button></>}
      />
      <Tabs value={workspace} onValueChange={(view) => navigate({ to: "/leads", search: { view }, resetScroll: false, replace: true })}>
        <TabsList className="h-auto flex-wrap gap-1"><TabsTrigger value="leads">Lead pipeline</TabsTrigger><TabsTrigger value="accounts">Accounts & portal</TabsTrigger></TabsList>
      </Tabs>
      {workspace === "accounts" ? <AccountPortfolio /> : <>
      <StatChipRow chips={chips} cols={3} />
      <div className="space-y-4 min-h-96">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="open">Open</TabsTrigger>
                <TabsTrigger value="followup">Follow-ups</TabsTrigger>
                <TabsTrigger value="won">Won</TabsTrigger>
                <TabsTrigger value="lost">Lost</TabsTrigger>
                <TabsTrigger value="all">All</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder="Search leads…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={mine ? "mine" : "team"} onValueChange={(v) => setMine(v === "mine")}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="mine">My leads</SelectItem><SelectItem value="team">Team pipeline</SelectItem></SelectContent></Select>
          </div>

          {!isLoading && filtered.length === 0 ? (
            <EmptyState title="No leads here" description="Create a lead to start tracking this prospect." icon={Target} />
          ) : (
            <DataGrid rows={filtered} columns={columns} loading={isLoading} />
          )}
      </div>
      </>}

      {form && (
        <Dialog open onOpenChange={(o) => !o && setForm(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{form.id ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Company / prospect name</Label>
                <Input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Select value={form.title || "none"} onValueChange={(v) => setForm({ ...form, title: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {TITLES.map((t: string) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contact person</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} maxLength={120} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} maxLength={255} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={40} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Source</Label>
                <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Service interest</Label>
                <Input value={form.interest} onChange={(e) => setForm({ ...form, interest: e.target.value })}
                  placeholder="VPS, VoIP, Starlink…" maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label>Estimated value</Label>
                <Input type="number" min={0} step="0.01" value={form.estimated_value}
                  onChange={(e) => setForm({ ...form, estimated_value: Number(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Owner</Label>
                <Select value={form.assigned_to || "none"} onValueChange={(v) => setForm({ ...form, assigned_to: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Unassigned</SelectItem>
                    {staff.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Next follow-up</Label>
                <Input type="date" value={form.next_follow_up} onChange={(e) => setForm({ ...form, next_follow_up: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} maxLength={2000} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
              <Button disabled={!form.company_name.trim() || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save lead"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </PageShell>
  );
}
