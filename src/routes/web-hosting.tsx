import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/module-page";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusPill } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/web-hosting")({
  head: () => ({ meta: [{ title: "Web Hosting — IMT Operations" }] }),
  component: WebHostingPage,
});

function WebHostingPage() {
  return (
    <ModulePage
      eyebrow="Services"
      title="Web Hosting"
      description="cPanel accounts, hosted websites and renewal tracking."
      table="web_hosting_accounts"
      queryKey="web_hosting_accounts"
      searchFields={["domain", "username", "provider", "plan", "account_number"]}
      emptyLabel="No hosting accounts yet."
      createTitle="New hosting account"
      createLabel="Add hosting"
      emptyForm={{ domain: "", provider: "", control_panel: "cpanel", control_panel_url: "", username: "", plan: "", disk_quota_gb: "", bandwidth_gb: "", monthly_cost: 0, renewal_date: "", notes: "" }}
      validateForm={(f) => (!f.domain ? "Domain required" : null)}
      transformInsert={(f) => ({ ...f, monthly_cost: Number(f.monthly_cost) || 0, disk_quota_gb: f.disk_quota_gb ? Number(f.disk_quota_gb) : null, bandwidth_gb: f.bandwidth_gb ? Number(f.bandwidth_gb) : null, renewal_date: f.renewal_date || null })}
      columns={[
        { header: "Domain", cell: (r: any) => <span className="font-mono font-semibold">{r.domain}</span> },
        { header: "Plan", cell: (r: any) => <div><div className="font-semibold">{r.plan || "—"}</div><div className="text-xs text-muted-foreground">{r.provider || "—"}</div></div> },
        { header: "User", cell: (r: any) => <span className="font-mono text-xs">{r.username || "—"}</span> },
        { header: "Cost/mo", cell: (r: any) => <span className="font-mono">${Number(r.monthly_cost).toFixed(2)}</span> },
        { header: "Renewal", cell: (r: any) => r.renewal_date || "—" },
        { header: "Status", cell: (r: any) => <StatusPill tone={r.status === "active" ? "success" : "warning"}>{r.status}</StatusPill> },
        { header: "cPanel", cell: (r: any) => r.control_panel_url ? <Button size="sm" variant="outline" asChild><a href={r.control_panel_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3 mr-1" />Open</a></Button> : "—" },
      ]}
      renderForm={(form, setForm) => (
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-2"><Label>Domain *</Label><Input required value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value.toLowerCase() })} placeholder="client.co.zw" /></div>
          <div className="space-y-2"><Label>Provider</Label><Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} placeholder="Zim Domains / cPanel Inc" /></div>
          <div className="space-y-2"><Label>Plan</Label><Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} placeholder="Business / Starter" /></div>
          <div className="space-y-2"><Label>cPanel URL</Label><Input value={form.control_panel_url} onChange={(e) => setForm({ ...form, control_panel_url: e.target.value })} placeholder="https://cpanel.example.com:2083" /></div>
          <div className="space-y-2"><Label>Username</Label><Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="space-y-2"><Label>Disk (GB)</Label><Input type="number" value={form.disk_quota_gb} onChange={(e) => setForm({ ...form, disk_quota_gb: e.target.value })} /></div>
          <div className="space-y-2"><Label>Bandwidth (GB)</Label><Input type="number" value={form.bandwidth_gb} onChange={(e) => setForm({ ...form, bandwidth_gb: e.target.value })} /></div>
          <div className="space-y-2"><Label>Monthly cost (USD)</Label><Input type="number" step="0.01" value={form.monthly_cost} onChange={(e) => setForm({ ...form, monthly_cost: e.target.value })} /></div>
          <div className="space-y-2"><Label>Renewal date</Label><Input type="date" value={form.renewal_date} onChange={(e) => setForm({ ...form, renewal_date: e.target.value })} /></div>
          <div className="col-span-2 space-y-2"><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
      )}
    />
  );
}
