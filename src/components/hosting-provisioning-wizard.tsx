import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronLeft, ChevronRight, Globe, Loader2, Package, RefreshCw, Server } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listHostingPackages, provisionHostingAccount, provisionNewHostingAccount } from "@/lib/hosting.functions";
import { packageLimit, type HostingPackageServer } from "@/lib/hosting-packages";

const INITIAL = {
  customer_id: "",
  domain: "",
  whm_server_id: "",
  plan: "",
  monthly_cost: "",
  currency: "USD",
  renewal_date: "",
  notes: "",
};

const STEPS = ["Client & domain", "Server & package", "Review & provision"];

export function HostingProvisioningWizard({
  open,
  onOpenChange,
  customers,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customers: any[];
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(INITIAL);
  const listFn = useServerFn(listHostingPackages);
  const provisionFn = useServerFn(provisionNewHostingAccount);
  const options = useQuery({
    queryKey: ["hosting-provisioning-packages"],
    queryFn: async () => (await listFn()) as HostingPackageServer[],
    enabled: open,
    retry: false,
  });

  const servers = options.data ?? [];
  const selectedServer = servers.find((server) => server.id === form.whm_server_id);
  const selectedPackage = selectedServer?.packages.find((item) => item.name === form.plan);
  const selectedCustomer = customers.find((customer) => customer.id === form.customer_id);

  useEffect(() => {
    if (!open || form.whm_server_id || servers.length === 0) return;
    const preferred = servers.find((server) => server.isDefault && server.packages.length > 0)
      ?? servers.find((server) => server.packages.length > 0);
    if (preferred) setForm((current) => ({ ...current, whm_server_id: preferred.id }));
  }, [open, form.whm_server_id, servers]);

  const set = (key: keyof typeof INITIAL, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const domainValid = useMemo(() => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(form.domain.trim()), [form.domain]);
  const canContinue = step === 1
    ? Boolean(form.customer_id && domainValid)
    : step === 2
      ? Boolean(form.whm_server_id && selectedPackage)
      : true;

  const provision = useMutation({
    mutationFn: () => provisionFn({ data: {
      customer_id: form.customer_id,
      domain: form.domain.trim().toLowerCase(),
      whm_server_id: form.whm_server_id,
      plan: form.plan,
      monthly_cost: form.monthly_cost ? Number(form.monthly_cost) : 0,
      currency: form.currency,
      renewal_date: form.renewal_date || undefined,
      notes: form.notes.trim() || undefined,
    } }),
    onSuccess: (result: any) => {
      if (result.provisioned) {
        toast.success(`${form.domain} is active on ${form.plan}`, { description: `cPanel user: ${result.username}` });
      } else {
        toast.error("Hosting record saved, but WHM setup was not completed", {
          description: `${result.error} Open the hosting account to retry provisioning.`,
          duration: 12000,
        });
      }
      setForm(INITIAL);
      setStep(1);
      onOpenChange(false);
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const close = (next: boolean) => {
    if (provision.isPending) return;
    onOpenChange(next);
    if (!next) {
      setStep(1);
      setForm(INITIAL);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4 sm:px-6">
          <DialogTitle>Provision web hosting</DialogTitle>
          <DialogDescription>Choose a real package from the connected WHM server, review it, then create the cPanel account.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2 border-b bg-muted/20 px-5 py-3 sm:px-6" aria-label="Provisioning progress">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const complete = step > number;
            return (
              <div key={label} className={`flex items-center gap-2 text-xs ${number === step ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${number === step ? "border-primary bg-primary text-primary-foreground" : complete ? "border-primary bg-primary/10 text-primary" : "bg-background"}`}>
                  {complete ? <Check className="h-3.5 w-3.5" /> : number}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </div>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="hosting-client">Client *</Label>
                <Select value={form.customer_id} onValueChange={(value) => set("customer_id", value)}>
                  <SelectTrigger id="hosting-client"><SelectValue placeholder="Choose the client receiving this service" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => <SelectItem key={customer.id} value={customer.id}>{customer.company_name} ({customer.account_number})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="hosting-domain">Domain *</Label>
                <Input id="hosting-domain" autoComplete="off" value={form.domain} onChange={(event) => set("domain", event.target.value.toLowerCase())} placeholder="client.co.zw" />
                {form.domain && !domainValid && <p className="text-xs text-destructive">Enter a domain such as client.co.zw, without https:// or a path.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="hosting-price">Selling price / month</Label>
                <Input id="hosting-price" type="number" min="0" step="0.01" value={form.monthly_cost} onChange={(event) => set("monthly_cost", event.target.value)} placeholder="0.00" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(value) => set("currency", value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="USD">USD</SelectItem><SelectItem value="ZWG">ZWG</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="hosting-renewal">Next renewal date</Label>
                <Input id="hosting-renewal" type="date" value={form.renewal_date} onChange={(event) => set("renewal_date", event.target.value)} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="hosting-notes">Setup notes</Label>
                <Textarea id="hosting-notes" rows={3} value={form.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Migration, DNS or nameserver notes…" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-2">
                  <Label>WHM server *</Label>
                  <Select value={form.whm_server_id} onValueChange={(value) => setForm((current) => ({ ...current, whm_server_id: value, plan: "" }))} disabled={options.isLoading}>
                    <SelectTrigger><SelectValue placeholder={options.isLoading ? "Loading connected servers…" : "Choose a server"} /></SelectTrigger>
                    <SelectContent>
                      {servers.map((server) => <SelectItem key={server.id} value={server.id} disabled={server.packages.length === 0}>{server.name}{server.isDefault ? " · Default" : ""}{server.packages.length === 0 ? " · Packages unavailable" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" onClick={() => options.refetch()} disabled={options.isFetching}>
                  <RefreshCw className={`mr-1.5 h-4 w-4 ${options.isFetching ? "animate-spin" : ""}`} />Refresh packages
                </Button>
              </div>

              {options.isLoading && <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading available packages from WHM…</div>}
              {options.isError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{(options.error as Error).message}</div>}
              {!options.isLoading && !options.isError && servers.length === 0 && <div className="rounded-lg border p-4 text-sm text-muted-foreground">No active WHM server is configured. Add and test a server under Web Hosting → WHM servers first.</div>}
              {selectedServer?.error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{selectedServer.name}: {selectedServer.error}</div>}

              {selectedServer && selectedServer.packages.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <Label>Available packages *</Label>
                    <p className="mt-1 text-xs text-muted-foreground">Package names and limits were loaded live from {selectedServer.name}.</p>
                  </div>
                  <div role="radiogroup" aria-label="Available hosting packages" className="grid gap-3 md:grid-cols-2">
                    {selectedServer.packages.map((item) => {
                      const selected = form.plan === item.name;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          key={item.name}
                          onClick={() => set("plan", item.name)}
                          className={`rounded-xl border p-4 text-left transition ${selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "bg-card hover:border-primary/50"}`}
                        >
                          <span className="flex items-start justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2"><Package className="h-4 w-4 shrink-0 text-primary" /><span className="break-all font-semibold">{friendlyPackageName(item.name)}</span></span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? "border-primary bg-primary text-primary-foreground" : "bg-background"}`}>{selected && <Check className="h-3 w-3" />}</span>
                          </span>
                          <span className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground">
                            <span>Disk: <strong className="font-medium text-foreground">{item.diskMb == null ? "Unlimited" : formatMegabytes(item.diskMb)}</strong></span>
                            <span>Bandwidth: <strong className="font-medium text-foreground">{item.bandwidthMb == null ? "Unlimited" : formatMegabytes(item.bandwidthMb)}</strong></span>
                            <span>Mailboxes: <strong className="font-medium text-foreground">{packageLimit(item.emailAccounts)}</strong></span>
                            <span>Databases: <strong className="font-medium text-foreground">{packageLimit(item.databases)}</strong></span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && selectedPackage && selectedServer && (
            <div className="space-y-5">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-4 flex items-center gap-2"><Globe className="h-5 w-5 text-primary" /><h3 className="font-semibold">Confirm provisioning</h3></div>
                <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
                  <Review label="Client" value={`${selectedCustomer?.company_name ?? "—"} (${selectedCustomer?.account_number ?? "—"})`} />
                  <Review label="Domain" value={form.domain} mono />
                  <Review label="WHM server" value={selectedServer.name} />
                  <Review label="Package" value={selectedPackage.name} mono />
                  <Review label="Disk quota" value={selectedPackage.diskMb == null ? "Unlimited" : formatMegabytes(selectedPackage.diskMb)} />
                  <Review label="Selling price" value={`${form.currency} ${Number(form.monthly_cost || 0).toFixed(2)} / month`} />
                  <Review label="Renewal" value={form.renewal_date || "Not set"} />
                  <Review label="Initial status" value="Pending → Active after WHM confirms creation" />
                </dl>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="font-medium">What happens next</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                  <li>The system creates the cPanel account using the selected package.</li>
                  <li>The initial password is stored in the credential vault.</li>
                  <li>The service only becomes active after WHM confirms creation.</li>
                  <li>Registrar nameservers are not changed automatically; update delegation separately if required.</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 border-t px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={() => close(false)} disabled={provision.isPending}>Cancel</Button>
          <div className="flex items-center gap-2">
            {step > 1 && <Button type="button" variant="outline" onClick={() => setStep((current) => current - 1)} disabled={provision.isPending}><ChevronLeft className="mr-1 h-4 w-4" />Back</Button>}
            {step < 3 ? (
              <Button type="button" disabled={!canContinue} onClick={() => setStep((current) => current + 1)}>Continue<ChevronRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <Button type="button" disabled={!canContinue || provision.isPending} onClick={() => provision.mutate()}>
                {provision.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Server className="mr-1.5 h-4 w-4" />}
                {provision.isPending ? "Provisioning…" : "Create & provision"}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExistingHostingPackageDialog({
  account,
  open,
  onOpenChange,
  onDone,
}: {
  account: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [serverId, setServerId] = useState("");
  const [plan, setPlan] = useState("");
  const listFn = useServerFn(listHostingPackages);
  const provisionFn = useServerFn(provisionHostingAccount);
  const options = useQuery({
    queryKey: ["hosting-provisioning-packages"],
    queryFn: async () => (await listFn()) as HostingPackageServer[],
    enabled: open,
    retry: false,
  });
  const servers = options.data ?? [];
  const server = servers.find((item) => item.id === serverId);
  const selectedPackage = server?.packages.find((item) => item.name === plan);

  useEffect(() => {
    if (!open || servers.length === 0) return;
    const preferred = servers.find((item) => item.id === account?.whm_server_id && item.packages.length > 0)
      ?? servers.find((item) => item.isDefault && item.packages.length > 0)
      ?? servers.find((item) => item.packages.length > 0);
    if (preferred && !serverId) setServerId(preferred.id);
  }, [open, servers, account?.whm_server_id, serverId]);

  const provision = useMutation({
    mutationFn: () => provisionFn({ data: { id: account.id, plan, whm_server_id: serverId } }),
    onSuccess: (result: any) => {
      toast.success(`${account.domain} is active on ${plan}`, { description: `cPanel user: ${result.username}` });
      setPlan("");
      setServerId("");
      onOpenChange(false);
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!provision.isPending) onOpenChange(next); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Choose a package for {account?.domain}</DialogTitle>
          <DialogDescription>The selected live WHM package will be used to create this pending cPanel account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>WHM server</Label>
            <Select value={serverId} onValueChange={(value) => { setServerId(value); setPlan(""); }}>
              <SelectTrigger><SelectValue placeholder={options.isLoading ? "Loading servers…" : "Choose a server"} /></SelectTrigger>
              <SelectContent>{servers.map((item) => <SelectItem key={item.id} value={item.id} disabled={item.packages.length === 0}>{item.name}{item.packages.length === 0 ? " · Unavailable" : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {server?.error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{server.error}</p>}
          {server && server.packages.length > 0 && (
            <div className="space-y-2">
              <Label>Available package</Label>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger><SelectValue placeholder="Choose a package" /></SelectTrigger>
                <SelectContent>{server.packages.map((item) => <SelectItem key={item.name} value={item.name}>{friendlyPackageName(item.name)} · {item.diskMb == null ? "Unlimited disk" : formatMegabytes(item.diskMb)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {selectedPackage && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <Review label="Disk" value={selectedPackage.diskMb == null ? "Unlimited" : formatMegabytes(selectedPackage.diskMb)} />
              <Review label="Bandwidth" value={selectedPackage.bandwidthMb == null ? "Unlimited" : formatMegabytes(selectedPackage.bandwidthMb)} />
              <Review label="Mailboxes" value={packageLimit(selectedPackage.emailAccounts)} />
              <Review label="Databases" value={packageLimit(selectedPackage.databases)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={provision.isPending}>Cancel</Button>
          <Button disabled={!selectedPackage || provision.isPending} onClick={() => provision.mutate()}>
            {provision.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Server className="mr-1.5 h-4 w-4" />}
            {provision.isPending ? "Provisioning…" : "Provision selected package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Review({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`mt-0.5 break-words font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function formatMegabytes(value: number): string {
  if (value >= 1024 * 1024) return `${Number((value / (1024 * 1024)).toFixed(2))} TB`;
  if (value >= 1024) return `${Number((value / 1024).toFixed(2))} GB`;
  return `${value} MB`;
}

function friendlyPackageName(value: string): string {
  const separator = value.indexOf("_");
  return separator > 0 ? value.slice(separator + 1) : value;
}
