import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader, StatusPill } from "@/components/page";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const EVENT_TYPES = ["deployed", "moved", "serviced", "warranty_renewed", "reassigned", "retired", "lost", "note"];

export const Route = createFileRoute("/assets_/$id")({
  head: () => ({ meta: [{ title: "Asset — IMT Operations" }] }),
  component: AssetDetail,
});

function AssetDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const { data: asset } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("assets").select("*, customers:customer_id(company_name,account_number)").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw notFound();
      return data as any;
    },
  });
  const { data: events = [] } = useQuery({
    queryKey: ["asset-events", id],
    queryFn: async () => (await supabase.from("asset_lifecycle_events").select("*").eq("asset_id", id).order("occurred_at", { ascending: false })).data ?? [],
  });

  if (!asset) return <PageContainer><PageHeader title="Loading…" /></PageContainer>;

  const wDays = asset.warranty_expires ? Math.floor((new Date(asset.warranty_expires).getTime() - Date.now()) / 86400000) : null;
  const wTone: any = wDays == null ? "neutral" : wDays < 0 ? "danger" : wDays < 30 ? "warning" : "success";

  return (
    <PageContainer>
      <PageHeader
        eyebrow={<Link to="/assets" className="text-solar hover:underline">← Assets</Link> as any}
        title={`${asset.make} ${asset.model || ""}`.trim() || asset.asset_tag || "Asset"}
        description={<span className="font-mono text-xs">{asset.asset_tag || "—"} · SN {asset.serial_number || "—"}</span> as any}
      />
      <div className="grid gap-6 md:grid-cols-4">
        <Field label="Type" value={<StatusPill tone="info">{asset.asset_type}</StatusPill>} />
        <Field label="Status" value={<StatusPill tone={asset.status === "in_service" ? "success" : "warning"}>{asset.status.replace(/_/g, " ")}</StatusPill>} />
        <Field label="Warranty" value={<StatusPill tone={wTone}>{wDays == null ? "n/a" : wDays < 0 ? `expired ${-wDays}d ago` : `${wDays}d left`}</StatusPill>} />
        <Field label="Customer" value={asset.account_number ? <Link to="/customers/$accountNumber" params={{ accountNumber: asset.account_number }} className="text-solar hover:underline font-mono text-sm">{asset.account_number}</Link> : <span className="text-muted-foreground text-sm">Internal</span>} />
      </div>

      <Card>
        <div className="p-4 flex items-center justify-between border-b">
          <h3 className="font-display font-semibold">Lifecycle timeline</h3>
          <AddEvent assetId={id} onDone={() => qc.invalidateQueries({ queryKey: ["asset-events", id] })} />
        </div>
        <CardContent className="p-6">
          {events.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">No events yet.</p> : (
            <ol className="relative border-l border-border pl-6 space-y-6">
              {(events as any[]).map((ev) => (
                <li key={ev.id} className="relative">
                  <span className="absolute -left-[29px] h-4 w-4 rounded-full bg-solar border-2 border-background" />
                  <div className="flex items-center gap-2">
                    <StatusPill tone="info">{ev.event_type.replace(/_/g, " ")}</StatusPill>
                    <span className="text-xs text-muted-foreground">{new Date(ev.occurred_at).toLocaleString()}</span>
                  </div>
                  {ev.notes && <p className="text-sm mt-2 text-foreground/80">{ev.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function Field({ label, value }: any) {
  return <Card><CardContent className="p-5"><p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{label}</p><div className="mt-2">{value}</div></CardContent></Card>;
}

function AddEvent({ assetId, onDone }: { assetId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ event_type: "serviced", occurred_at: new Date().toISOString().slice(0, 16), notes: "" });
  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("asset_lifecycle_events").insert({
        asset_id: assetId, event_type: form.event_type, occurred_at: new Date(form.occurred_at).toISOString(), notes: form.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setOpen(false); onDone(); toast.success("Event recorded"); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="text-solar-foreground" style={{ background: "var(--gradient-solar)" }}><Plus className="h-4 w-4 mr-1" />Log event</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log lifecycle event</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-4">
          <div className="space-y-2"><Label>Type</Label>
            <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>When</Label><Input type="datetime-local" value={form.occurred_at} onChange={(e) => setForm({ ...form, occurred_at: e.target.value })} /></div>
          <div className="space-y-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <DialogFooter><Button type="submit" disabled={create.isPending}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
