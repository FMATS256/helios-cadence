import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createCustomerRecord } from "@/lib/ops.functions";
import { listCatalog, assignServices } from "@/lib/catalog.functions";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ChevronRight, ChevronLeft, Building2, User, Package, Sparkles, ArrowRight, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/customers/new")({
  head: () => ({ meta: [{ title: "Onboard client — IMT Operations" }] }),
  component: OnboardingWizard,
});

type CatalogItem = { id: string; code: string; name: string; category: string; unit_price: number; currency: string; billing_cycle: string; is_active: boolean };

const STEPS = [
  { key: "company", label: "Company", icon: Building2 },
  { key: "contact", label: "Primary contact", icon: User },
  { key: "services", label: "Services", icon: Package },
  { key: "review", label: "Review & create", icon: Sparkles },
] as const;

function OnboardingWizard() {
  const navigate = useNavigate();
  const createCustomer = useServerFn(createCustomerRecord);
  const catalogFn = useServerFn(listCatalog);
  const assignFn = useServerFn(assignServices);

  const [step, setStep] = useState(0);
  const [company, setCompany] = useState({ company_name: "", industry: "", website: "", status: "active", notes: "" });
  const [contact, setContact] = useState({ full_name: "", email: "", phone: "", role: "Primary contact" });
  const [selected, setSelected] = useState<Record<string, { qty: number; price?: number }>>({});
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [cycleFilter, setCycleFilter] = useState<string>("all");

  const { data: catalog = [] } = useQuery({
    queryKey: ["catalog-active"],
    queryFn: async () => (await catalogFn()) as CatalogItem[],
  });
  const activeCatalog = catalog.filter((c) => c.is_active);
  const allCategories = useMemo(() => Array.from(new Set(activeCatalog.map((c) => c.category))).sort(), [activeCatalog]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeCatalog.filter((c) => {
      if (catFilter !== "all" && c.category !== catFilter) return false;
      if (cycleFilter !== "all" && c.billing_cycle !== cycleFilter) return false;
      if (!q) return true;
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q);
    });
  }, [activeCatalog, search, catFilter, cycleFilter]);
  const byCategory = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const c of filtered) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return Array.from(map.entries()).sort();
  }, [filtered]);

  const selectedItems = activeCatalog
    .filter((c) => selected[c.id])
    .map((c) => ({ ...c, qty: selected[c.id].qty, price: selected[c.id].price ?? c.unit_price }));
  const monthlyTotal = selectedItems.reduce((s, i) => s + i.qty * i.price, 0);

  const submit = useMutation({
    mutationFn: async () => {
      if (!company.company_name.trim()) throw new Error("Company name is required");
      const cust = await createCustomer({
        data: {
          company_name: company.company_name,
          industry: company.industry,
          primary_email: contact.email,
          primary_phone: contact.phone,
          website: company.website,
          status: company.status,
          notes: company.notes,
        },
      });
      const customerId = (cust as any).id;
      const accountNumber = (cust as any).account_number;

      if (contact.full_name.trim() || contact.email.trim()) {
        await supabase.from("customer_contacts").insert({
          customer_id: customerId,
          full_name: contact.full_name || "Primary contact",
          email: contact.email || null,
          phone: contact.phone || null,
          role: contact.role || null,
          is_primary: true,
        } as any);
      }

      if (selectedItems.length) {
        await assignFn({
          data: {
            customer_id: customerId,
            items: selectedItems.map((s) => ({ catalog_id: s.id, quantity: s.qty, unit_price: s.price })),
          },
        });
      }
      return accountNumber;
    },
    onSuccess: (acct) => {
      toast.success(`Client ${acct} onboarded`);
      navigate({ to: "/customers/$accountNumber", params: { accountNumber: acct } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = () => {
    if (step === 0) return company.company_name.trim().length > 0;
    return true;
  };

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Onboarding"
        title="Onboard a new client"
        description="Guided setup — company, primary contact, services. Everything links to a new M-number."
        actions={<Button variant="outline" asChild><Link to="/customers">Cancel</Link></Button>}
      />

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div key={s.key} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm border transition-colors",
                active && "bg-solar text-solar-foreground border-solar shadow-sm",
                done && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
                !active && !done && "bg-muted/40 text-muted-foreground border-border",
              )}>
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                <span className="font-medium">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && <div className={cn("h-px flex-1", done ? "bg-emerald-500/40" : "bg-border")} />}
            </div>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2"><Label>Company name *</Label><Input autoFocus value={company.company_name} onChange={(e) => setCompany({ ...company, company_name: e.target.value })} placeholder="Registered or trading name" /></div>
              <div className="space-y-2"><Label>Industry</Label><Input value={company.industry} onChange={(e) => setCompany({ ...company, industry: e.target.value })} placeholder="Mining, banking, retail…" /></div>
              <div className="space-y-2"><Label>Status</Label>
                <Select value={company.status} onValueChange={(v) => setCompany({ ...company, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["active","prospect","suspended"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2"><Label>Website</Label><Input value={company.website} onChange={(e) => setCompany({ ...company, website: e.target.value })} placeholder="https://" /></div>
              <div className="space-y-2 md:col-span-2"><Label>Internal notes</Label><Textarea rows={3} value={company.notes} onChange={(e) => setCompany({ ...company, notes: e.target.value })} placeholder="Anything the account manager should know…" /></div>
            </div>
          )}

          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>Full name</Label><Input value={contact.full_name} onChange={(e) => setContact({ ...contact, full_name: e.target.value })} /></div>
              <div className="space-y-2"><Label>Role</Label><Input value={contact.role} onChange={(e) => setContact({ ...contact, role: e.target.value })} placeholder="IT Manager, CFO…" /></div>
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} /></div>
              <div className="space-y-2"><Label>Phone</Label><Input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} /></div>
              <p className="md:col-span-2 text-xs text-muted-foreground">The primary contact receives portal invites and billing notices.</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_180px] gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by code (e.g. VPS-BASIC), name, category…" className="pl-9" />
                </div>
                <Select value={catFilter} onValueChange={setCatFilter}>
                  <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {allCategories.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={cycleFilter} onValueChange={setCycleFilter}>
                  <SelectTrigger><SelectValue placeholder="Cycle" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any cycle</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                    <SelectItem value="one-time">One-time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-muted-foreground">{filtered.length} of {activeCatalog.length} packages</div>
              {byCategory.length === 0 && (
                <div className="text-sm text-muted-foreground rounded-xl border border-dashed p-8 text-center">
                  No packages match your filters. <Link to="/catalog" className="text-solar underline">Manage catalog</Link>
                </div>
              )}
              {byCategory.map(([cat, items]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{cat}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((it) => {
                      const sel = selected[it.id];
                      return (
                        <div key={it.id} className={cn(
                          "rounded-xl border p-4 cursor-pointer transition-colors",
                          sel ? "border-solar bg-solar/5" : "hover:bg-muted/40",
                        )} onClick={() => {
                          setSelected((prev) => {
                            const n = { ...prev };
                            if (n[it.id]) delete n[it.id];
                            else n[it.id] = { qty: 1, price: Number(it.unit_price) };
                            return n;
                          });
                        }}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="font-semibold">{it.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">{it.code}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-solar">${Number(it.unit_price).toFixed(2)}</div>
                              <div className="text-[10px] text-muted-foreground">/ {it.billing_cycle}</div>
                            </div>
                          </div>
                          {sel && (
                            <div className="mt-3 grid grid-cols-2 gap-2" onClick={(e) => e.stopPropagation()}>
                              <div><Label className="text-xs">Qty</Label><Input type="number" min={1} value={sel.qty} onChange={(e) => setSelected((p) => ({ ...p, [it.id]: { ...p[it.id], qty: Math.max(1, Number(e.target.value) || 1) } }))} className="h-8" /></div>
                              <div><Label className="text-xs">Unit price</Label><Input type="number" step="0.01" value={sel.price ?? it.unit_price} onChange={(e) => setSelected((p) => ({ ...p, [it.id]: { ...p[it.id], price: Number(e.target.value) } }))} className="h-8" /></div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {selectedItems.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border bg-muted/40 p-4">
                  <div className="text-sm">{selectedItems.length} service{selectedItems.length === 1 ? "" : "s"} selected</div>
                  <div className="text-lg font-bold text-solar">~${monthlyTotal.toFixed(2)}/mo</div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ReviewBlock title="Company">
                  <div className="font-semibold">{company.company_name || "—"}</div>
                  <div className="text-sm text-muted-foreground">{company.industry || "No industry"}</div>
                  <div className="text-sm text-muted-foreground">{company.website || "No website"}</div>
                  <Badge variant="outline" className="mt-2">{company.status}</Badge>
                </ReviewBlock>
                <ReviewBlock title="Primary contact">
                  <div className="font-semibold">{contact.full_name || "—"}</div>
                  <div className="text-sm text-muted-foreground">{contact.role}</div>
                  <div className="text-sm text-muted-foreground">{contact.email || "—"} · {contact.phone || "—"}</div>
                </ReviewBlock>
              </div>
              <ReviewBlock title={`Services (${selectedItems.length})`}>
                {selectedItems.length === 0 ? <div className="text-sm text-muted-foreground">No services selected — you can assign them later.</div> : (
                  <ul className="space-y-1 text-sm">
                    {selectedItems.map((s) => (
                      <li key={s.id} className="flex justify-between"><span>{s.name} × {s.qty}</span><span className="font-mono">${(s.qty * s.price).toFixed(2)}/{s.billing_cycle}</span></li>
                    ))}
                  </ul>
                )}
                {selectedItems.length > 0 && <div className="mt-2 pt-2 border-t flex justify-between font-semibold"><span>Estimated recurring</span><span className="text-solar">${monthlyTotal.toFixed(2)}/mo</span></div>}
              </ReviewBlock>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}><ChevronLeft className="h-4 w-4 mr-1" /> Back</Button>
            {step < STEPS.length - 1 ? (
              <Button disabled={!canNext()} onClick={() => setStep((s) => s + 1)} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button disabled={submit.isPending} onClick={() => submit.mutate()} className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}>
                {submit.isPending ? "Creating client…" : <>Create client <ArrowRight className="h-4 w-4 ml-1" /></>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}
