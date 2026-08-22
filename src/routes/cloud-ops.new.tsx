import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  listCloudProviders, listProviderRegions, listProviderImages,
  listProviderInstanceTypes, provisionOnProvider, estimateProviderPrice,
} from "@/lib/providers.functions";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Cloud, MapPin, Cpu, HardDrive, Server, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

type ProviderName = "kamatera" | "vultr" | "contabo" | "hetzner" | "digitalocean" | "aws" | "azure" | "gcp";

export const Route = createFileRoute("/cloud-ops/new")({
  head: () => ({ meta: [{ title: "Provision Server — IMT Cloud Ops" }] }),
  component: NewServerPage,
});

/* ----------------------------- Reusable tile ----------------------------- */
function Tile({
  active, disabled, onClick, children, className,
}: {
  active?: boolean; disabled?: boolean; onClick?: () => void;
  children: React.ReactNode; className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative text-left rounded-xl border p-4 transition-all",
        "hover:border-primary hover:shadow-md hover:-translate-y-0.5",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none",
        active
          ? "border-primary bg-primary/5 ring-2 ring-primary/40 shadow-sm"
          : "border-border bg-card",
        className,
      )}
    >
      {active && (
        <span className="absolute top-2 right-2 grid place-items-center h-5 w-5 rounded-full bg-primary text-primary-foreground">
          <Check className="h-3 w-3" />
        </span>
      )}
      {children}
    </button>
  );
}

function StepHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="grid place-items-center h-8 w-8 rounded-lg bg-primary text-primary-foreground font-bold text-sm">{n}</div>
      <div className="min-w-0">
        <h3 className="font-semibold text-base leading-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

/* ------------------------------- Main page ------------------------------- */
function NewServerPage() {
  const navigate = useNavigate();
  const fnProviders = useServerFn(listCloudProviders);
  const fnRegions = useServerFn(listProviderRegions);
  const fnImages = useServerFn(listProviderImages);
  const fnPlans = useServerFn(listProviderInstanceTypes);
  const fnProvision = useServerFn(provisionOnProvider);
  const fnEstimate = useServerFn(estimateProviderPrice);

  const [provider, setProvider] = useState<ProviderName>("vultr");
  const [form, setForm] = useState({
    customer_id: "", name: "",
    region: "", image: "", plan_id: "",
    password: "", passwordConfirm: "", ssh_key: "",
    daily_backup: false, monitoring: false, public_net: true,
    billing_cycle: "monthly" as "hourly" | "monthly",
    selling_price_usd: 0, notes: "",
    imageTab: "server" as "server" | "app" | "private",
    imageQuery: "",
  });
  const setF = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const providers = useQuery({
    queryKey: ["cloud-providers"], queryFn: () => fnProviders(), staleTime: 5 * 60_000,
  });
  const customers = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers")
      .select("id,account_number,company_name").is("archived_at", null)
      .order("company_name")).data ?? [],
  });
  const regions = useQuery({
    queryKey: [provider, "regions"],
    queryFn: () => fnRegions({ data: { provider } }),
    staleTime: 5 * 60_000,
  });
  const images = useQuery({
    queryKey: [provider, "images", form.region],
    queryFn: () => fnImages({ data: { provider, region: form.region } }),
    enabled: !!form.region,
  });
  const plans = useQuery({
    queryKey: [provider, "plans", form.region],
    queryFn: () => fnPlans({ data: { provider, region: form.region } }),
    enabled: !!form.region,
  });

  // Regions grouped by continent bucket.
  const regionsByBucket = useMemo(() => {
    const groups: Record<string, typeof regions.data> = {};
    for (const r of regions.data ?? []) {
      const bucket = continentBucket(r.country || r.name);
      (groups[bucket] ||= [] as any).push(r);
    }
    return groups;
  }, [regions.data]);
  const [regionBucket, setRegionBucket] = useState<string>("Europe");

  const filteredImages = useMemo(() => {
    const q = form.imageQuery.toLowerCase().trim();
    return (images.data ?? []).filter((im: any) => !q || im.name.toLowerCase().includes(q));
  }, [images.data, form.imageQuery]);

  const activePlan = plans.data?.find((p) => p.id === form.plan_id);

  // Group plans by family (Kamatera: B/A/T/D · Vultr: type · Contabo: family)
  const plansByFamily = useMemo(() => {
    const groups: Record<string, NonNullable<typeof plans.data>> = {};
    for (const p of plans.data ?? []) {
      const k = (p.family ?? "General") as string;
      (groups[k] ||= [] as any).push(p);
    }
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => a.monthly_usd - b.monthly_usd);
    }
    return groups;
  }, [plans.data]);
  const [planFamily, setPlanFamily] = useState<string>("");
  const activeFamily = planFamily || Object.keys(plansByFamily)[0] || "";

  // Live provider price (calls provider estimatePrice for current selection).
  const priceEstimate = useQuery({
    queryKey: [provider, "estimate", form.region, form.plan_id, form.daily_backup, form.monitoring],
    enabled: !!form.region && !!form.plan_id,
    queryFn: () => fnEstimate({ data: {
      provider, region: form.region, plan_id: form.plan_id,
      cpu_type: activePlan?.family, cpu_cores: activePlan?.cpu_cores,
      ram_mb: activePlan?.ram_mb, disk_gb: activePlan?.disk_gb,
      daily_backup: form.daily_backup, monitoring: form.monitoring,
    } }),
    staleTime: 60_000,
  });

  const monthly = priceEstimate.data?.monthly_usd ?? activePlan?.monthly_usd ?? 0;
  const backupCost = priceEstimate.data ? 0 : (form.daily_backup ? monthly * 0.2 : 0);
  const monitoringCost = priceEstimate.data ? 0 : (form.monitoring ? 5 : 0);
  const totalMonthly = round(monthly + backupCost + monitoringCost);
  const totalHourly = priceEstimate.data?.hourly_usd ?? round(totalMonthly / 730);
  const margin = round(Number(form.selling_price_usd) - totalMonthly);

  // Contabo only accepts letters, numbers, spaces and hyphens in the root password.
  const passwordCharsetError =
    provider === "contabo" && form.password && !/^[A-Za-z0-9 -]+$/.test(form.password)
      ? "Password can only contain letters, numbers, spaces, and hyphens (-)."
      : null;
  const passwordMismatch = !!form.passwordConfirm && form.password !== form.passwordConfirm;
  const passwordRequired = provider === "kamatera" || provider === "contabo";
  const passwordTooShort = passwordRequired && !!form.password && form.password.length < 8;
  const passwordBlocked = !!passwordCharsetError || passwordMismatch || passwordTooShort;

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.name) throw new Error("Give the server a name.");
      if (!form.region) throw new Error("Select a region.");
      if (!form.plan_id) throw new Error("Choose a server plan.");
      if (passwordCharsetError) throw new Error(passwordCharsetError);
      if (passwordRequired) {
        if (provider === "kamatera" && !form.image) throw new Error("Choose an OS image.");
        if (!form.password || form.password.length < 8) throw new Error("Root password must be at least 8 characters.");
        if (form.password !== form.passwordConfirm) throw new Error("Passwords do not match.");
      }

      const [cpuType] = (form.plan_id.split("-") as string[]);
      const result = await fnProvision({ data: {
        provider,
        customer_id: form.customer_id || null,
        name: form.name,
        region: form.region,
        image: form.image || undefined,
        plan_id: form.plan_id,
        cpu_type: provider === "kamatera" ? (activePlan?.family || cpuType) : undefined,
        cpu_cores: activePlan?.cpu_cores,
        ram_mb: activePlan?.ram_mb,
        disk_gb: activePlan?.disk_gb,
        ssh_key: form.ssh_key || undefined,
        password: form.password ? String(form.password) : undefined,
        daily_backup: form.daily_backup,
        monitoring: form.monitoring,
        billing_cycle: form.billing_cycle,
        selling_price_usd: Number(form.selling_price_usd) || 0,
        monthly_cost_usd: totalMonthly,
        notes: form.notes || undefined,
      } });
      if ("provisioning_error" in result && result.provisioning_error) {
        throw new Error(result.provisioning_error);
      }
      return result;
    },
    onSuccess: () => { toast.success("Server provisioning started"); navigate({ to: "/cloud-ops" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Cloud Ops"
        title="Deploy new cloud server"
        description="Pick a provider, region, OS and specs the way you would in the provider's own console."
      />

      <form onSubmit={(e) => { e.preventDefault(); submit.mutate(); }} className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Step 1: Provider */}
          <Card><CardContent className="p-6">
            <StepHeader n={1} title="Choose deployment environment" subtitle="Which cloud should host this server?" />
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {(providers.data ?? []).map((p) => (
                <Tile
                  key={p.name}
                  active={provider === p.name}
                  disabled={!p.enabled}
                  onClick={() => {
                    setProvider(p.name as ProviderName);
                    setF({ region: "", image: "", plan_id: "" });
                    setPlanFamily("");
                  }}
                >
                  <Cloud className="h-6 w-6 mb-2 text-primary" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-sm">{p.displayName}</div>
                    {p.recommended && <Badge className="text-[9px] px-1 py-0 h-auto bg-emerald-500 hover:bg-emerald-500 text-white">RECOMMENDED</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.note || (p.enabled ? "Available" : "Coming soon")}</div>
                </Tile>
              ))}
            </div>
          </CardContent></Card>

          {/* Step 2: Customer + Name */}
          <Card><CardContent className="p-6 space-y-4">
            <StepHeader n={2} title="Server details" subtitle="Who is this for and what should we call it?" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Customer *</Label>
                <Select value={form.customer_id} onValueChange={(v) => setF({ customer_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Assign to customer" /></SelectTrigger>
                  <SelectContent>
                    {(customers.data ?? []).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Server name *</Label>
                <Input value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="prod-web-01" />
              </div>
            </div>
          </CardContent></Card>

          {/* Step 3: Region */}
          <Card><CardContent className="p-6">
            <StepHeader n={3} title="Choose zone" subtitle="Where should the server run?" />
            {regions.isLoading && <p className="text-sm text-muted-foreground">Loading regions…</p>}
            {regions.isError && <p className="text-sm text-destructive">{(regions.error as Error).message}</p>}
            {regions.data && (
              <>
                <div className="flex flex-wrap gap-2 mb-4 border-b pb-2">
                  {Object.keys(regionsByBucket).map((b) => (
                    <button
                      key={b} type="button"
                      onClick={() => setRegionBucket(b)}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition",
                        (regionBucket === b || (!regionsByBucket[regionBucket] && b === Object.keys(regionsByBucket)[0]))
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >{b}</button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(regionsByBucket[regionBucket] ?? regionsByBucket[Object.keys(regionsByBucket)[0]] ?? []).map((r: any) => (
                    <Tile
                      key={r.id}
                      active={form.region === r.id}
                      onClick={() => setF({ region: r.id, image: "", plan_id: "" })}
                    >
                      <div className="flex items-center gap-3">
                        <MapPin className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm uppercase tracking-wide truncate">{r.city ?? r.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.country ?? r.id}</div>
                        </div>
                      </div>
                    </Tile>
                  ))}
                </div>
              </>
            )}
          </CardContent></Card>

          {/* Step 4: Image */}
          <Card><CardContent className="p-6">
            <StepHeader n={4} title="Choose an image" subtitle="Operating system or preconfigured app image." />
            {!form.region && <p className="text-sm text-muted-foreground">Pick a region first.</p>}
            {form.region && (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search images (ubuntu, debian, windows…)"
                    className="pl-9"
                    value={form.imageQuery}
                    onChange={(e) => setF({ imageQuery: e.target.value })}
                  />
                </div>
                {images.isLoading && <p className="text-sm text-muted-foreground">Loading images…</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {filteredImages.slice(0, 90).map((im: any) => (
                    <Tile key={im.id} active={form.image === im.id} onClick={() => setF({ image: im.id })}>
                      <div className="flex items-start gap-3">
                        <OsIcon os={im.os} />
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{im.name}</div>
                          <div className="text-xs text-muted-foreground uppercase">{im.os ?? "custom"}</div>
                        </div>
                      </div>
                    </Tile>
                  ))}
                </div>
              </>
            )}
          </CardContent></Card>

          {/* Step 5: Specs / Plan */}
          <Card><CardContent className="p-6">
            <StepHeader n={5} title="Choose server specs" subtitle="Pick a preset plan for CPU · RAM · Disk." />
            {!form.region && <p className="text-sm text-muted-foreground">Pick a region first.</p>}
            {form.region && plans.isLoading && <p className="text-sm text-muted-foreground">Loading plans…</p>}
            {plans.error && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {(plans.error as Error).message}
              </div>
            )}
            {plans.data && Object.keys(plansByFamily).length > 0 && (
              <>
                {Object.keys(plansByFamily).length > 1 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {Object.keys(plansByFamily).map((f) => (
                      <button
                        key={f} type="button"
                        onClick={() => setPlanFamily(f)}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-md border transition",
                          activeFamily === f
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >{familyLabel(f)}</button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[520px] overflow-y-auto pr-1">
                  {(plansByFamily[activeFamily] ?? []).slice(0, 60).map((p) => (
                    <Tile key={p.id} active={form.plan_id === p.id} onClick={() => setF({ plan_id: p.id })}>
                      <div className="flex items-center justify-between mb-2">
                        <Badge variant="outline" className="text-[10px]">{p.family ?? "plan"}</Badge>
                        <span className="text-sm font-bold text-primary">${p.monthly_usd}/mo</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><Cpu className="h-3 w-3 mx-auto text-muted-foreground" /><div className="text-sm font-semibold mt-1">{p.cpu_cores}</div><div className="text-[10px] text-muted-foreground">vCPU</div></div>
                        <div><Server className="h-3 w-3 mx-auto text-muted-foreground" /><div className="text-sm font-semibold mt-1">{Math.round(p.ram_mb / 1024)}</div><div className="text-[10px] text-muted-foreground">GB RAM</div></div>
                        <div><HardDrive className="h-3 w-3 mx-auto text-muted-foreground" /><div className="text-sm font-semibold mt-1">{p.disk_gb}</div><div className="text-[10px] text-muted-foreground">GB SSD</div></div>
                      </div>
                    </Tile>
                  ))}
                </div>
              </>
            )}
          </CardContent></Card>

          {/* Step 6: Add-ons */}
          <Card><CardContent className="p-6">
            <StepHeader n={6} title="Add-ons & networking" subtitle="Backups, monitoring and billing cycle." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center justify-between p-3 rounded-lg border cursor-pointer">
                <div><div className="font-medium text-sm">Daily backup</div><div className="text-xs text-muted-foreground">+20% of plan cost</div></div>
                <Switch checked={form.daily_backup} onCheckedChange={(v) => setF({ daily_backup: v })} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border cursor-pointer">
                <div><div className="font-medium text-sm">Monitoring</div><div className="text-xs text-muted-foreground">+$5 / month</div></div>
                <Switch checked={form.monitoring} onCheckedChange={(v) => setF({ monitoring: v })} />
              </label>
              <label className="flex items-center justify-between p-3 rounded-lg border cursor-pointer">
                <div><div className="font-medium text-sm">Public network</div><div className="text-xs text-muted-foreground">Public IPv4 + 5TB traffic</div></div>
                <Switch checked={form.public_net} onCheckedChange={(v) => setF({ public_net: v })} />
              </label>
              <div className="p-3 rounded-lg border">
                <Label className="text-xs">Billing cycle</Label>
                <Select value={form.billing_cycle} onValueChange={(v: any) => setF({ billing_cycle: v })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="hourly">Hourly</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </CardContent></Card>

          {/* Step 7: Finalize */}
          <Card><CardContent className="p-6 space-y-4">
            <StepHeader n={7} title="Finalize settings" subtitle="Root credentials and notes." />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Root password {passwordRequired ? "*" : ""}</Label>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setF({ password: String(e.target.value) })}
                  placeholder={provider === "contabo" ? "Letters, numbers, spaces and - only" : "Min 8 chars, mix case, digit"}
                  aria-invalid={!!passwordCharsetError || passwordTooShort}
                />
                {passwordCharsetError && (
                  <p className="mt-1 text-xs text-destructive">{passwordCharsetError}</p>
                )}
                {!passwordCharsetError && passwordTooShort && (
                  <p className="mt-1 text-xs text-destructive">Root password must be at least 8 characters.</p>
                )}
                {provider === "contabo" && !passwordCharsetError && (
                  <p className="mt-1 text-xs text-muted-foreground">Contabo allows letters, numbers, spaces and hyphens (-) only.</p>
                )}
              </div>
              <div>
                <Label>Validate password</Label>
                <Input type="password" autoComplete="new-password" value={form.passwordConfirm} onChange={(e) => setF({ passwordConfirm: String(e.target.value) })} />
                {passwordMismatch && <p className="mt-1 text-xs text-destructive">Passwords do not match.</p>}
              </div>

              <div className="md:col-span-2">
                <Label>SSH public key (optional)</Label>
                <Input value={form.ssh_key} onChange={(e) => setF({ ssh_key: e.target.value })} placeholder="ssh-rsa AAAA…" />
              </div>
              <div className="md:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} />
              </div>
            </div>
          </CardContent></Card>
        </div>

        {/* Sticky pricing summary */}
        <aside className="lg:sticky lg:top-6 self-start space-y-4">
          <Card><CardContent className="p-6 space-y-4">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide">Order summary</div>
              <div className="text-2xl font-black mt-1">${totalMonthly}<span className="text-sm font-normal text-muted-foreground">/month</span></div>
              <div className="text-xs text-muted-foreground">≈ ${totalHourly}/hour {priceEstimate.isFetching ? "· updating…" : priceEstimate.data ? "· live" : ""}</div>
            </div>
            <div className="border-t pt-3 space-y-2 text-sm">
              <SummaryRow label="Provider" value={providerLabel(provider)} />
              <SummaryRow label="Region" value={form.region || "—"} />
              <SummaryRow label="Image" value={form.image || "—"} truncate />
              <SummaryRow label="Plan" value={form.plan_id || "—"} truncate />
              {activePlan && <SummaryRow label="Specs" value={`${activePlan.cpu_cores} vCPU · ${Math.round(activePlan.ram_mb / 1024)}GB RAM · ${activePlan.disk_gb}GB`} />}
              {priceEstimate.data?.breakdown?.length ? (
                <div className="pt-1 border-t space-y-1">
                  {priceEstimate.data.breakdown.map((b: any, i: number) => (
                    <SummaryRow key={i} label={b.label} value={`$${b.monthly_usd}`} truncate />
                  ))}
                </div>
              ) : (
                <>
                  <SummaryRow label="Backup" value={form.daily_backup ? `+$${round(backupCost)}` : "no"} />
                  <SummaryRow label="Monitoring" value={form.monitoring ? `+$${monitoringCost}` : "no"} />
                </>
              )}
            </div>
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs">Customer price / month (USD)</Label>
              <Input type="number" step="0.01" value={form.selling_price_usd} onChange={(e) => setF({ selling_price_usd: Number(e.target.value) })} />
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Margin</span><span className={cn("font-mono font-semibold", margin < 0 ? "text-destructive" : "text-emerald-600")}>${margin}</span></div>
            </div>
            <Button
              type="submit" disabled={submit.isPending || passwordBlocked}
              className="w-full text-solar-foreground"
              style={{ background: "var(--gradient-solar)" }}
            >
              {submit.isPending ? "Deploying…" : "Deploy server"}
            </Button>
          </CardContent></Card>
        </aside>
      </form>
    </PageContainer>
  );
}

/* ------------------------------- Helpers -------------------------------- */
function SummaryRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={cn("font-mono text-right", truncate && "truncate max-w-[200px]")}>{value}</span>
    </div>
  );
}

function OsIcon({ os }: { os?: string }) {
  const color = ({
    ubuntu: "bg-orange-500", debian: "bg-red-500", almalinux: "bg-blue-500",
    rocky: "bg-emerald-500", windows: "bg-sky-500",
  } as any)[os ?? ""] ?? "bg-muted";
  const letter = (os ?? "?")[0]?.toUpperCase() ?? "?";
  return <div className={cn("h-9 w-9 rounded-lg grid place-items-center text-white font-bold shrink-0", color)}>{letter}</div>;
}

function continentBucket(hint: string): string {
  const h = (hint ?? "").toLowerCase();
  if (/(us|usa|united states|canada|mexico|america)/.test(h)) return "North America";
  if (/(brazil|argentina|chile|peru|colombia|latin)/.test(h)) return "South America";
  if (/(uk|united kingdom|germany|france|italy|spain|netherlands|ireland|poland|sweden|romania|europe|eu)/.test(h)) return "Europe";
  if (/(china|japan|singapore|india|hong kong|korea|indonesia|asia)/.test(h)) return "Asia";
  if (/(australia|sydney|new zealand|oceania)/.test(h)) return "Oceania";
  if (/(israel|uae|dubai|saudi|middle east)/.test(h)) return "Middle East";
  if (/(south africa|nigeria|kenya|egypt|africa)/.test(h)) return "Africa";
  return "Other";
}

function providerLabel(p: ProviderName) {
  return ({ kamatera: "Kamatera", vultr: "Vultr", contabo: "Contabo",
    hetzner: "Hetzner", digitalocean: "DigitalOcean", aws: "AWS", azure: "Azure", gcp: "GCP" } as any)[p];
}

function familyLabel(f: string) {
  return ({ B: "General", A: "Availability", T: "Burstable", D: "Dedicated" } as any)[f] ?? f;
}

function round(n: number) { return Math.round(n * 100) / 100; }
