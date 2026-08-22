import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DataGrid, DetailCard, StatusBadge,
  toneForStatus, RefreshButton, EmptyState, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listEquipmentAllocations, updateEquipmentStatus } from "@/lib/techops.functions";

export const Route = createFileRoute("/techops/equipment")({
  head: () => ({
    meta: [
      { title: "Equipment Register — IMT Technical Operations" },
      { name: "description", content: "Track equipment reserved, issued, installed, returned or lost across every installation job, with automatic stock and asset updates." },
      { property: "og:title", content: "Equipment Register — IMT Technical Operations" },
      { property: "og:description", content: "Field equipment allocation and chain of custody for IMT installations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipmentPage,
});

const STATUSES = ["all", "reserved", "issued", "installed", "returned", "lost"];

function EquipmentPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [status, setStatus] = useState("reserved");
  const [mine, setMine] = useState(false);
  const [target, setTarget] = useState<any | null>(null);
  const [nextStatus, setNextStatus] = useState("issued");
  const [serials, setSerials] = useState("");
  const [notes, setNotes] = useState("");

  const listFn = useServerFn(listEquipmentAllocations);
  const updateFn = useServerFn(updateEquipmentStatus);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["job-equipment", status, mine],
    queryFn: async () => (await listFn({ data: { status, mine } })) as any[],
  });

  const rows = data ?? [];
  const count = (s: string) => rows.filter((r: any) => r.status === s).length;

  const update = useMutation({
    mutationFn: () => updateFn({
      data: {
        id: target.id,
        status: nextStatus as any,
        serial_numbers: serials || undefined,
        notes: notes || undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Equipment updated");
      setTarget(null); setSerials(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["job-equipment"] });
      qc.invalidateQueries({ queryKey: ["techops-dashboard"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <PageShell>
      <SectionHeader
        eyebrow="Technical Operations"
        title="Equipment Register"
        description="Chain of custody from store to site. Issuing deducts stock, installing registers the hardware as a customer asset."
        actions={
          <div className="flex items-center gap-2">
            <Button variant={mine ? "default" : "outline"} size="sm" onClick={() => setMine((m) => !m)}>
              {mine ? "My allocations" : "All technicians"}
            </Button>
            <RefreshButton loading={isFetching} onClick={() => qc.invalidateQueries({ queryKey: ["job-equipment"] })} />
          </div>
        }
      />

      <StatChipRow
        cols={5}
        chips={[
          { label: "Reserved", value: count("reserved"), color: "#f59e0b", text: "#3b2600" },
          { label: "Issued", value: count("issued"), color: "#0ea5e9" },
          { label: "Installed", value: count("installed"), color: "#059669" },
          { label: "Returned", value: count("returned"), color: "#475569" },
          { label: "Lost", value: count("lost"), color: "#dc2626" },
        ]}
      />

      <Tabs value={status} onValueChange={setStatus}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="capitalize">{s}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DetailCard title="Allocations" padded={false}>
        <DataGrid
          loading={isLoading}
          rows={rows}
          empty={<EmptyState title="No allocations" description="No equipment matches this filter." />}
          columns={[
            { header: "Item", cell: (r: any) => <span className="font-medium">{r.description}</span> },
            { header: "Qty", align: "right", cell: (r: any) => r.quantity },
            { header: "Serial(s)", cell: (r: any) => r.serial_numbers ?? "—" },
            { header: "Job", cell: (r: any) => r.task?.title ?? "—" },
            { header: "Site", cell: (r: any) => r.task?.site_name ?? "—" },
            { header: "Technician", cell: (r: any) => r.technician ?? "—" },
            { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
            { header: "Allocated", cell: (r: any) => shortDate(r.created_at) },
            {
              header: "",
              align: "right",
              cell: (r: any) => (
                <div className="flex gap-1 justify-end">
                  <Button size="sm" variant="outline" onClick={() => { setTarget(r); setNextStatus(r.status === "reserved" ? "issued" : "installed"); setSerials(r.serial_numbers ?? ""); }}>
                    Update
                  </Button>
                  {r.task_id && (
                    <Button size="sm" variant="ghost" onClick={() => navigate({ to: "/techops/jobs/$id", params: { id: r.task_id } })}>
                      Job
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </DetailCard>

      <Dialog open={!!target} onOpenChange={(o) => { if (!o) setTarget(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Update {target?.description}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>New status</Label>
              <Select value={nextStatus} onValueChange={setNextStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["reserved", "issued", "installed", "returned", "lost"].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Serial number(s)</Label>
              <Input value={serials} onChange={(e) => setSerials(e.target.value)} placeholder="Comma separated" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              Issuing or installing deducts the item from inventory once. Installing also creates a deployed customer asset. Returning puts stock back.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)}>Cancel</Button>
            <Button onClick={() => update.mutate()} disabled={update.isPending}>
              {update.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
