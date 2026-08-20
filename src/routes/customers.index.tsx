import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Download, Columns3, Filter, ChevronDown, ChevronRight, Share2 } from "lucide-react";
import { toast } from "sonner";

type Customer = {
  id: string; account_number: string; company_name: string; industry: string | null;
  status: string; account_type: string | null; primary_email: string | null;
  primary_phone: string | null; tags: string[]; created_at: string;
};

export const Route = createFileRoute("/customers/")({
  validateSearch: (s: Record<string, unknown>): { q?: string } => (typeof s.q === "string" && s.q ? { q: s.q } : {}),
  head: () => ({
    meta: [
      { title: "Customer Directory — IMT Operations" },
      { name: "description", content: "Grouped customer directory with M-number accounts, live service counts, filters and export." },
      { property: "og:title", content: "Customer Directory — IMT Operations" },
      { property: "og:description", content: "Grouped customer directory with M-number accounts, live service counts, filters and export." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomersPage,
});

/* ---------------- column model ---------------- */

type Row = Customer & { services: number; openTickets: number };

const COLUMNS = [
  { key: "account_number", label: "Account #" },
  { key: "company_name", label: "Name" },
  { key: "account_type", label: "Type" },
  { key: "industry", label: "Industry" },
  { key: "services", label: "Services" },
  { key: "openTickets", label: "Open Tickets" },
  { key: "primary_email", label: "Email" },
  { key: "primary_phone", label: "Phone" },
  { key: "status", label: "Status" },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

function toCsv(rows: Row[], cols: ColKey[]) {
  const head = COLUMNS.filter((c) => cols.includes(c.key)).map((c) => c.label);
  const body = rows.map((r) =>
    COLUMNS.filter((c) => cols.includes(c.key)).map((c) => `"${String((r as any)[c.key] ?? "").replace(/"/g, '""')}"`).join(","),
  );
  return [head.join(","), ...body].join("\n");
}

/* ---------------- grouped data panel ---------------- */

function DataPanel({
  title, rows, industries,
}: { title: string; rows: Row[]; industries: string[] }) {
  const [openGroup, setOpenGroup] = useState(true);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [industry, setIndustry] = useState("all");
  const [status, setStatus] = useState("all");
  const [cols, setCols] = useState<ColKey[]>(["account_number", "company_name", "account_type", "industry", "services", "openTickets", "status"]);
  const [selected, setSelected] = useState<string[]>([]);

  const filtered = useMemo(() => {
    const v = q.toLowerCase();
    return rows.filter((r) => {
      if (industry !== "all" && (r.industry || "—") !== industry) return false;
      if (status !== "all" && r.status !== status) return false;
      if (!v) return true;
      return [r.company_name, r.account_number, r.industry, r.primary_email, r.primary_phone]
        .some((f) => (f || "").toLowerCase().includes(v));
    });
  }, [rows, q, industry, status]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * pageSize, current * pageSize);
  const show = (k: ColKey) => cols.includes(k);

  const exportCsv = () => {
    const blob = new Blob([toCsv(filtered, cols)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${title.toLowerCase().replace(/\s+/g, "-")}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} rows`);
  };

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpenGroup((o) => !o)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold hover:bg-muted/40"
      >
        {openGroup ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {title}
        <Badge variant="secondary" className="ml-1 font-mono">{rows.length}</Badge>
      </button>

      {openGroup && (
        <div className="px-4 pb-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-card p-1">
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="h-8 w-[130px] border-0 bg-transparent text-xs shadow-none focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>Show {n} rows</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={exportCsv}>
                <Download className="h-3.5 w-3.5" />Export
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"><Columns3 className="h-3.5 w-3.5" />Column</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  {COLUMNS.map((c) => (
                    <DropdownMenuCheckboxItem
                      key={c.key}
                      checked={cols.includes(c.key)}
                      onCheckedChange={(v) => setCols((prev) => (v ? [...prev, c.key] : prev.filter((k) => k !== c.key)))}
                    >
                      {c.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs"><Filter className="h-3.5 w-3.5" />Filter</Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Industry</Label>
                    <Select value={industry} onValueChange={(v) => { setIndustry(v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All industries</SelectItem>
                        {industries.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any status</SelectItem>
                        {["active", "prospect", "suspended", "archived"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" onClick={() => { setIndustry("all"); setStatus("all"); }}>Reset</Button>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search:" className="h-8 w-52 pl-8 text-xs" />
              </div>
              {action}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={slice.length > 0 && slice.every((r) => selected.includes(r.id))}
                      onCheckedChange={(v) =>
                        setSelected(v ? Array.from(new Set([...selected, ...slice.map((r) => r.id)])) : selected.filter((id) => !slice.some((r) => r.id === id)))
                      }
                    />
                  </TableHead>
                  <TableHead className="w-16">Action</TableHead>
                  {COLUMNS.filter((c) => show(c.key)).map((c) => <TableHead key={c.key}>{c.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={cols.length + 2} className="py-10 text-center text-sm text-muted-foreground">No data available in table</TableCell>
                  </TableRow>
                ) : slice.map((r) => (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Checkbox
                        checked={selected.includes(r.id)}
                        onCheckedChange={(v) => setSelected(v ? [...selected, r.id] : selected.filter((id) => id !== r.id))}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost" size="icon" className="h-7 w-7 text-primary"
                        title="Copy account link"
                        onClick={() => {
                          navigator.clipboard.writeText(`${window.location.origin}/customers/${r.account_number}`);
                          toast.success(`Link to ${r.account_number} copied`);
                        }}
                      >
                        <Share2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                    {show("account_number") && (
                      <TableCell>
                        <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="font-mono font-semibold text-primary hover:underline">{r.account_number}</Link>
                      </TableCell>
                    )}
                    {show("company_name") && (
                      <TableCell className="font-medium">
                        <Link to="/customers/$accountNumber" params={{ accountNumber: r.account_number }} className="text-primary hover:underline">{r.company_name}</Link>
                      </TableCell>
                    )}
                    {show("account_type") && <TableCell><Badge variant="secondary" className="capitalize">{r.account_type || "corporate"}</Badge></TableCell>}
                    {show("industry") && <TableCell className="text-muted-foreground">{r.industry || "Default"}</TableCell>}
                    {show("services") && <TableCell><Badge variant={r.services ? "default" : "secondary"} className="font-mono">{r.services}</Badge></TableCell>}
                    {show("openTickets") && <TableCell><Badge variant={r.openTickets ? "destructive" : "secondary"} className="font-mono">{r.openTickets}</Badge></TableCell>}
                    {show("primary_email") && <TableCell className="text-muted-foreground">{r.primary_email || "—"}</TableCell>}
                    {show("primary_phone") && <TableCell className="text-muted-foreground">{r.primary_phone || "—"}</TableCell>}
                    {show("status") && (
                      <TableCell>
                        <StatusPill tone={r.status === "active" ? "success" : r.status === "suspended" ? "danger" : "neutral"}>{r.status}</StatusPill>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Showing {filtered.length === 0 ? 0 : (current - 1) * pageSize + 1} to {Math.min(current * pageSize, filtered.length)} of {filtered.length} entries
              {selected.length > 0 && ` · ${selected.length} selected`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>
              <span className="rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground">{current}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- page ---------------- */

function CustomersPage() {
  const { q } = Route.useSearch();
  const navigate = useNavigate();

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").is("archived_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Customer[];
    },
  });

  const { data: subs = [] } = useQuery({
    queryKey: ["customers", "subs-count"],
    queryFn: async () => {
      const { data } = await supabase.from("subscriptions").select("customer_id,status").eq("status", "active");
      return (data ?? []) as { customer_id: string; status: string }[];
    },
  });

  const { data: tix = [] } = useQuery({
    queryKey: ["customers", "ticket-count"],
    queryFn: async () => {
      const { data } = await supabase.from("tickets").select("customer_id,status").in("status", ["open", "in_progress", "waiting_customer"]);
      return (data ?? []) as { customer_id: string | null; status: string }[];
    },
  });

  const enriched: Row[] = useMemo(() => {
    const s: Record<string, number> = {};
    for (const r of subs) s[r.customer_id] = (s[r.customer_id] || 0) + 1;
    const t: Record<string, number> = {};
    for (const r of tix) if (r.customer_id) t[r.customer_id] = (t[r.customer_id] || 0) + 1;
    return rows.map((r) => ({ ...r, services: s[r.id] || 0, openTickets: t[r.id] || 0 }));
  }, [rows, subs, tix]);

  const industries = useMemo(
    () => Array.from(new Set(enriched.map((r) => r.industry || "—"))).sort(),
    [enriched],
  );

  const initial = (q || "").trim();
  const scoped = initial
    ? enriched.filter((r) =>
        [r.company_name, r.account_number, r.industry, r.primary_email].some((f) => (f || "").toLowerCase().includes(initial.toLowerCase())),
      )
    : enriched;

  const corporate = scoped.filter((r) => (r.account_type || "corporate") !== "individual" && r.status !== "prospect" && r.status !== "suspended");
  const individual = scoped.filter((r) => (r.account_type || "") === "individual" && r.status !== "prospect" && r.status !== "suspended");
  const suspended = scoped.filter((r) => r.status === "suspended");
  const prospects = scoped.filter((r) => r.status === "prospect");

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Operations"
        title="Customer Directory"
        description="Every customer gets a permanent M-number that links everything they own across the platform."
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/customers/new" })}>Onboard New Client</Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="accounts">
            <div className="border-b px-4 pt-3">
              <TabsList className="h-auto w-full justify-start gap-4 rounded-none border-0 bg-transparent p-0">
                <TabsTrigger value="accounts" className="rounded-none border-b-2 border-transparent px-1 pb-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  Customer Accounts
                </TabsTrigger>
                <TabsTrigger value="pipeline" className="rounded-none border-b-2 border-transparent px-1 pb-2 data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none">
                  Pipeline &amp; Inactive
                </TabsTrigger>
              </TabsList>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (
              <>
                <TabsContent value="accounts" className="m-0">
                  <DataPanel title="Corporate" rows={corporate} industries={industries} action={AddCustomer} />
                  <DataPanel title="Individual" rows={individual} industries={industries} action={AddCustomer} />
                </TabsContent>
                <TabsContent value="pipeline" className="m-0">
                  <DataPanel title="Prospects" rows={prospects} industries={industries} action={AddCustomer} />
                  <DataPanel title="Suspended" rows={suspended} industries={industries} />
                </TabsContent>
              </>
            )}
          </Tabs>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
