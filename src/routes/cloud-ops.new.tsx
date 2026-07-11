import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listDatacenters, getCapabilities, listImages, provisionServer } from "@/lib/kamatera.functions";
import { PageContainer, PageHeader } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/cloud-ops/new")({
  head: () => ({ meta: [{ title: "Provision Server — IMT Cloud Ops" }] }),
  component: NewServerPage,
});

function NewServerPage() {
  const navigate = useNavigate();
  const fnDatacenters = useServerFn(listDatacenters);
  const fnCaps = useServerFn(getCapabilities);
  const fnImages = useServerFn(listImages);
  const fnProvision = useServerFn(provisionServer);

  const [form, setForm] = useState({
    customer_id: "",
    name: "",
    datacenter: "",
    image: "",
    cpuType: "B",
    cpuCores: 1,
    ramMb: 1024,
    diskGb: 20,
    password: "",
    ssh_key: "",
    dailybackup: "no" as "yes" | "no",
    monitoring: "no" as "yes" | "no",
    billingcycle: "monthly" as "hourly" | "monthly",
    selling_price_usd: 0,
    monthly_cost_usd: 0,
    notes: "",
  });

  const setF = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const customers = useQuery({
    queryKey: ["customers-min"],
    queryFn: async () => (await supabase.from("customers").select("id,account_number,company_name").is("archived_at", null).order("company_name")).data ?? [],
  });

  const dcs = useQuery({
    queryKey: ["kamatera", "datacenters"],
    queryFn: () => fnDatacenters(),
    staleTime: 5 * 60_000,
  });

  const caps = useQuery({
    queryKey: ["kamatera", "caps", form.datacenter],
    queryFn: () => fnCaps({ data: { datacenter: form.datacenter } }),
    enabled: !!form.datacenter,
    staleTime: 5 * 60_000,
  });

  const images = useQuery({
    queryKey: ["kamatera", "images", form.datacenter],
    queryFn: () => fnImages({ data: { datacenter: form.datacenter } }),
    enabled: !!form.datacenter,
    staleTime: 5 * 60_000,
  });

  const cpuTypeOptions = caps.data?.cpuTypes ?? [];
  const activeCpuType = useMemo(
    () => cpuTypeOptions.find((c) => c.id === form.cpuType) ?? cpuTypeOptions[0],
    [cpuTypeOptions, form.cpuType],
  );

  const submit = useMutation({
    mutationFn: async () => {
      if (!form.datacenter || !form.image || !form.name || !form.password) {
        throw new Error("Fill customer, name, datacenter, image and root password.");
      }
      return fnProvision({
        data: {
          customer_id: form.customer_id || null,
          name: form.name,
          datacenter: form.datacenter,
          image: form.image,
          cpu: `${form.cpuCores}${form.cpuType}`,
          ram: form.ramMb,
          disk_size_0: form.diskGb,
          password: form.password,
          ssh_key: form.ssh_key || undefined,
          dailybackup: form.dailybackup,
          monitoring: form.monitoring,
          billingcycle: form.billingcycle,
          selling_price_usd: Number(form.selling_price_usd) || 0,
          monthly_cost_usd: Number(form.monthly_cost_usd) || 0,
          notes: form.notes || undefined,
        },
      });
    },
    onSuccess: (res) => {
      toast.success(`Provisioning started (command ${res.commandId ?? "queued"})`);
      navigate({ to: "/cloud-ops" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Cloud Ops"
        title="Provision Kamatera server"
        description="Configure the resource, review pricing, and dispatch a real Kamatera deployment."
      />

      <form
        onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}
        className="grid grid-cols-1 lg:grid-cols-3 gap-6"
      >
        <div className="lg:col-span-2 space-y-6">
          <Card><CardContent className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Customer</Label>
              <Select value={form.customer_id} onValueChange={(v) => setF({ customer_id: v })}>
                <SelectTrigger><SelectValue placeholder="Assign to customer (optional)" /></SelectTrigger>
                <SelectContent>
                  {(customers.data ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2"><Label>Server name *</Label>
              <Input value={form.name} onChange={(e) => setF({ name: e.target.value })} placeholder="prod-web-01" />
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-6 grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Datacenter *</Label>
              <Select value={form.datacenter} onValueChange={(v) => setF({ datacenter: v, image: "" })}>
                <SelectTrigger>
                  <SelectValue placeholder={dcs.isLoading ? "Loading…" : dcs.isError ? "Failed to load" : "Choose a Kamatera location"} />
                </SelectTrigger>
                <SelectContent>
                  {(dcs.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name} ({d.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {dcs.isError && <p className="text-xs text-destructive mt-1">{(dcs.error as Error).message}</p>}
            </div>

            <div className="col-span-2"><Label>OS image *</Label>
              <Select value={form.image} onValueChange={(v) => setF({ image: v })} disabled={!form.datacenter}>
                <SelectTrigger>
                  <SelectValue placeholder={!form.datacenter ? "Pick a datacenter first" : images.isLoading ? "Loading…" : "Choose an image"} />
                </SelectTrigger>
                <SelectContent>
                  {(images.data ?? []).slice(0, 60).map((im: any) => (
                    <SelectItem key={im.id ?? im.code ?? im.name} value={im.id ?? im.code ?? im.name}>
                      {im.datacenter ? `${im.datacenter} · ` : ""}{im.name ?? im.description ?? im.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div><Label>CPU type</Label>
              <Select value={form.cpuType} onValueChange={(v) => setF({ cpuType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cpuTypeOptions.length === 0
                    ? ["B", "A", "T", "D"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)
                    : cpuTypeOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.id} — {c.name}</SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>

            <div><Label>vCPU cores</Label>
              <Select value={String(form.cpuCores)} onValueChange={(v) => setF({ cpuCores: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(activeCpuType?.cpuCores ?? [1, 2, 4, 8, 16]).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div><Label>RAM (MB)</Label>
              <Select value={String(form.ramMb)} onValueChange={(v) => setF({ ramMb: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(activeCpuType?.ramMB ?? [1024, 2048, 4096, 8192, 16384]).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} MB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div><Label>Disk (GB)</Label>
              <Select value={String(form.diskGb)} onValueChange={(v) => setF({ diskGb: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(caps.data?.diskSizeGB ?? [20, 30, 50, 100, 200, 500]).map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} GB</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div><Label>Billing cycle</Label>
              <Select value={form.billingcycle} onValueChange={(v: any) => setF({ billingcycle: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div><Label>Daily backup</Label>
              <Select value={form.dailybackup} onValueChange={(v: any) => setF({ dailybackup: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div><Label>Monitoring</Label>
              <Select value={form.monitoring} onValueChange={(v: any) => setF({ monitoring: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-6 grid grid-cols-2 gap-4">
            <div><Label>Root password *</Label>
              <Input type="password" value={form.password} onChange={(e) => setF({ password: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Min 8 chars, mix of upper/lower/digit/special per Kamatera.</p>
            </div>
            <div><Label>SSH public key</Label>
              <Input value={form.ssh_key} onChange={(e) => setF({ ssh_key: e.target.value })} placeholder="ssh-rsa AAAA…" />
            </div>
            <div className="col-span-2"><Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setF({ notes: e.target.value })} />
            </div>
          </CardContent></Card>
        </div>

        <div className="space-y-6">
          <Card><CardContent className="p-6 space-y-4">
            <h3 className="font-semibold">Pricing</h3>
            <div><Label>Provider cost / month (USD)</Label>
              <Input type="number" step="0.01" value={form.monthly_cost_usd}
                onChange={(e) => setF({ monthly_cost_usd: Number(e.target.value) })} />
            </div>
            <div><Label>Customer price / month (USD)</Label>
              <Input type="number" step="0.01" value={form.selling_price_usd}
                onChange={(e) => setF({ selling_price_usd: Number(e.target.value) })} />
            </div>
            <div className="pt-2 border-t text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Margin</span>
                <span className="font-mono font-semibold">
                  ${(Number(form.selling_price_usd) - Number(form.monthly_cost_usd)).toFixed(2)}
                </span>
              </div>
            </div>
          </CardContent></Card>

          <Card><CardContent className="p-6 space-y-3 text-sm">
            <h3 className="font-semibold">Review</h3>
            <div className="flex justify-between"><span className="text-muted-foreground">Datacenter</span><span>{form.datacenter || "—"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Spec</span>
              <span>{form.cpuCores}×{form.cpuType} · {form.ramMb}MB · {form.diskGb}GB</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Billing</span><span>{form.billingcycle}</span></div>
            <Button type="submit" disabled={submit.isPending} className="w-full mt-3 text-solar-foreground"
              style={{ background: "var(--gradient-solar)" }}>
              {submit.isPending ? "Deploying…" : "Deploy server"}
            </Button>
          </CardContent></Card>
        </div>
      </form>
    </PageContainer>
  );
}
