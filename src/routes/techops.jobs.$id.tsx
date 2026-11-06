import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PageShell, SectionHeader, StatChipRow, DetailCard, DataGrid, StatusBadge,
  toneForStatus, RefreshButton, EmptyState, ActionBar, shortDate,
} from "@/components/enterprise";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, ListChecks, PackageCheck, Camera, PenLine, FileText,
  MapPin, Trash2, Plus, CheckCircle2, ArrowLeft,
} from "lucide-react";
import {
  getJob, updateJobDetails, addJobRequirement, removeJobRequirement, buildEquipmentPlan,
  allocateEquipment, updateEquipmentStatus, seedJobChecklist, addChecklistItem, toggleChecklistItem,
  uploadJobPhoto, deleteJobPhoto, captureSignoff, completeJob, listStockItems,
} from "@/lib/techops.functions";
import { WorkOrderThread } from "@/components/techops/work-order-thread";

export const Route = createFileRoute("/techops/jobs/$id")({
  head: () => ({
    meta: [
      { title: "Installation Job — IMT Technical Operations" },
      { name: "description", content: "Full installation lifecycle: requirements, equipment plan, checklist, site photos, configuration, customer sign-off and completion report." },
      { property: "og:title", content: "Installation Job — IMT Technical Operations" },
      { property: "og:description", content: "Manage an IMT installation job from requirements through sign-off and completion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JobPage,
});

function JobPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const jobFn = useServerFn(getJob);
  const detailsFn = useServerFn(updateJobDetails);
  const addReqFn = useServerFn(addJobRequirement);
  const rmReqFn = useServerFn(removeJobRequirement);
  const planFn = useServerFn(buildEquipmentPlan);
  const allocFn = useServerFn(allocateEquipment);
  const equipStatusFn = useServerFn(updateEquipmentStatus);
  const seedFn = useServerFn(seedJobChecklist);
  const addStepFn = useServerFn(addChecklistItem);
  const toggleFn = useServerFn(toggleChecklistItem);
  const uploadFn = useServerFn(uploadJobPhoto);
  const delPhotoFn = useServerFn(deleteJobPhoto);
  const signoffFn = useServerFn(captureSignoff);
  const completeFn = useServerFn(completeJob);
  const stockFn = useServerFn(listStockItems);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["techops-job", id],
    queryFn: async () => (await jobFn({ data: { id } })) as any,
  });
  const { data: stock } = useQuery({
    queryKey: ["techops-stock"],
    queryFn: async () => (await stockFn()) as any[],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["techops-job", id] });
    qc.invalidateQueries({ queryKey: ["techops-dashboard"] });
  };
  const fail = (e: any) => toast.error(e?.message ?? "Something went wrong");

  const job = data?.job;
  const checklist = data?.checklist ?? [];
  const equipment = data?.equipment ?? [];
  const requirements = data?.requirements ?? [];
  const photos = data?.photos ?? [];
  const signoffs = data?.signoffs ?? [];

  // --- local form state
  const [site, setSite] = useState<any | null>(null);
  const [reqLabel, setReqLabel] = useState("");
  const [reqQty, setReqQty] = useState("1");
  const [stepLabel, setStepLabel] = useState("");
  const [allocOpen, setAllocOpen] = useState(false);
  const [allocItem, setAllocItem] = useState("");
  const [allocDesc, setAllocDesc] = useState("");
  const [allocQty, setAllocQty] = useState("1");
  const [signOpen, setSignOpen] = useState(false);
  const [signName, setSignName] = useState("");
  const [signRole, setSignRole] = useState("");
  const [signNotes, setSignNotes] = useState("");
  const [completeOpen, setCompleteOpen] = useState(false);
  const [completionNotes, setCompletionNotes] = useState("");
  const [sendReport, setSendReport] = useState(true);
  const [report, setReport] = useState<string | null>(null);

  const siteForm = site ?? {
    site_name: job?.site_name ?? "",
    site_address: job?.site_address ?? "",
    site_contact_name: job?.site_contact_name ?? "",
    site_contact_phone: job?.site_contact_phone ?? "",
    site_contact_email: job?.site_contact_email ?? data?.contactEmail ?? "",
    site_lat: job?.site_lat != null ? String(job.site_lat) : "",
    site_lng: job?.site_lng != null ? String(job.site_lng) : "",
    network_config: job?.network_config ?? "",
    installation_notes: job?.installation_notes ?? "",
    testing_notes: job?.testing_notes ?? "",
  };
  const setField = (k: string, v: string) => setSite({ ...siteForm, [k]: v });

  const saveDetails = useMutation({
    mutationFn: () => detailsFn({
      data: {
        id,
        ...siteForm,
        site_lat: siteForm.site_lat === "" ? null : Number(siteForm.site_lat),
        site_lng: siteForm.site_lng === "" ? null : Number(siteForm.site_lng),
        geocode: true,
      },
    }),
    onSuccess: () => { toast.success("Job details saved"); setSite(null); refresh(); },
    onError: fail,
  });

  const addReq = useMutation({
    mutationFn: () => addReqFn({ data: { task_id: id, label: reqLabel, quantity: Number(reqQty) || 1 } }),
    onSuccess: () => { setReqLabel(""); setReqQty("1"); refresh(); },
    onError: fail,
  });
  const rmReq = useMutation({
    mutationFn: (reqId: string) => rmReqFn({ data: { id: reqId } }),
    onSuccess: refresh, onError: fail,
  });
  const plan = useMutation({
    mutationFn: () => planFn({ data: { task_id: id } }),
    onSuccess: (r: any) => {
      toast.success(`${r.allocated} allocation(s) created`);
      for (const s of r.shortfalls ?? []) toast.warning(s);
      refresh();
    },
    onError: fail,
  });
  const alloc = useMutation({
    mutationFn: () => allocFn({
      data: {
        task_id: id,
        inventory_item_id: allocItem || null,
        description: allocDesc || (stock ?? []).find((s: any) => s.id === allocItem)?.name || "",
        quantity: Number(allocQty) || 1,
      },
    }),
    onSuccess: () => { toast.success("Equipment allocated"); setAllocOpen(false); setAllocItem(""); setAllocDesc(""); setAllocQty("1"); refresh(); },
    onError: fail,
  });
  const equipStatus = useMutation({
    mutationFn: (vars: { id: string; status: any }) => equipStatusFn({ data: vars }),
    onSuccess: () => { toast.success("Equipment updated"); refresh(); },
    onError: fail,
  });
  const seed = useMutation({
    mutationFn: () => seedFn({ data: { task_id: id } }),
    onSuccess: () => { toast.success("Checklist created"); refresh(); },
    onError: fail,
  });
  const addStep = useMutation({
    mutationFn: () => addStepFn({ data: { task_id: id, label: stepLabel } }),
    onSuccess: () => { setStepLabel(""); refresh(); },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (vars: { id: string; done: boolean }) => toggleFn({ data: vars }),
    onSuccess: refresh, onError: fail,
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 8192) bin += String.fromCharCode(...buf.subarray(i, i + 8192));
      return uploadFn({
        data: { task_id: id, filename: file.name, content_type: file.type || "image/jpeg", data_base64: btoa(bin) },
      });
    },
    onSuccess: () => { toast.success("Photo uploaded"); refresh(); },
    onError: fail,
  });
  const delPhoto = useMutation({
    mutationFn: (photoId: string) => delPhotoFn({ data: { id: photoId } }),
    onSuccess: refresh, onError: fail,
  });
  const sign = useMutation({
    mutationFn: () => signoffFn({ data: { task_id: id, signed_by_name: signName, signed_by_role: signRole, notes: signNotes } }),
    onSuccess: () => { toast.success("Sign-off captured"); setSignOpen(false); setSignName(""); setSignRole(""); setSignNotes(""); refresh(); },
    onError: fail,
  });
  const complete = useMutation({
    mutationFn: () => completeFn({ data: { task_id: id, completion_notes: completionNotes, send_report: sendReport } }),
    onSuccess: (r: any) => {
      toast.success(r.emailed ? "Job completed — report emailed to the customer" : "Job completed");
      setCompleteOpen(false);
      setReport(r.report);
      refresh();
    },
    onError: fail,
  });

  if (isLoading) return <PageShell><p className="text-sm text-muted-foreground">Loading job…</p></PageShell>;
  if (!job) return <PageShell><EmptyState title="Job not found" description="This job may have been removed." /></PageShell>;

  const doneCount = checklist.filter((c: any) => c.done).length;

  return (
    <PageShell>
      <SectionHeader
        eyebrow={`Job ${job.id.slice(0, 8).toUpperCase()} · ${String(job.task_type).replace(/_/g, " ")}`}
        title={job.title}
        description={job.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/techops/dashboard" })}>
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Dashboard
            </Button>
            <RefreshButton loading={isFetching} onClick={refresh} />
          </div>
        }
      />

      <StatChipRow
        cols={6}
        chips={[
          { label: "Status", value: String(job.status).replace(/_/g, " "), color: job.status === "completed" ? "#059669" : "#4f46e5" },
          { label: "Priority", value: job.priority ?? "normal", color: "#f59e0b", text: "#3b2600" },
          { label: "Checklist", value: `${doneCount}/${checklist.length}`, color: "#0ea5e9" },
          { label: "Equipment", value: equipment.length, color: "#7c3aed" },
          { label: "Photos", value: photos.length, color: "#0f766e" },
          { label: "Sign-off", value: signoffs.length ? "Captured" : "Pending", color: signoffs.length ? "#059669" : "#dc2626" },
        ]}
      />

      <ActionBar
        actions={[
          { tone: "indigo", icon: ListChecks, label: "Generate Checklist", onClick: () => seed.mutate(), hidden: checklist.length > 0 },
          { tone: "sky", icon: PackageCheck, label: "Plan Equipment", onClick: () => plan.mutate(), hidden: !requirements.some((r: any) => !r.fulfilled) },
          { tone: "amber", icon: Plus, label: "Allocate Equipment", onClick: () => setAllocOpen(true) },
          { tone: "emerald", icon: PenLine, label: "Capture Sign-off", onClick: () => setSignOpen(true) },
          { tone: "rose", icon: CheckCircle2, label: "Complete Job", onClick: () => setCompleteOpen(true), disabled: job.status === "completed" },
        ]}
        visibleCount={6}
      />

      <WorkOrderThread task={{ ...job, assignee: data?.assignee, requester: data?.requester }} />

      <Tabs defaultValue="site">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="site"><MapPin className="h-3.5 w-3.5 mr-1.5" />Site & Config</TabsTrigger>
          <TabsTrigger value="requirements"><ClipboardList className="h-3.5 w-3.5 mr-1.5" />Requirements</TabsTrigger>
          <TabsTrigger value="equipment"><PackageCheck className="h-3.5 w-3.5 mr-1.5" />Equipment</TabsTrigger>
          <TabsTrigger value="checklist"><ListChecks className="h-3.5 w-3.5 mr-1.5" />Checklist</TabsTrigger>
          <TabsTrigger value="photos"><Camera className="h-3.5 w-3.5 mr-1.5" />Photos</TabsTrigger>
          <TabsTrigger value="signoff"><FileText className="h-3.5 w-3.5 mr-1.5" />Sign-off</TabsTrigger>
        </TabsList>

        <TabsContent value="site" className="mt-4 grid gap-4 lg:grid-cols-2">
          <DetailCard title="Site details">
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Site name</Label>
                <Input value={siteForm.site_name} onChange={(e) => setField("site_name", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Site address</Label>
                <Textarea value={siteForm.site_address} onChange={(e) => setField("site_address", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>On-site contact</Label>
                  <Input value={siteForm.site_contact_name} onChange={(e) => setField("site_contact_name", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Contact phone</Label>
                  <Input value={siteForm.site_contact_phone} onChange={(e) => setField("site_contact_phone", e.target.value)} /></div>
              </div>
              <div className="space-y-1.5"><Label>Client email (updates & completion report)</Label>
                <Input type="email" placeholder="client@company.co.zw" value={siteForm.site_contact_email} onChange={(e) => setField("site_contact_email", e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>Latitude</Label>
                  <Input inputMode="decimal" placeholder="-17.8252" value={siteForm.site_lat} onChange={(e) => setField("site_lat", e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Longitude</Label>
                  <Input inputMode="decimal" placeholder="31.0335" value={siteForm.site_lng} onChange={(e) => setField("site_lng", e.target.value)} /></div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!navigator.geolocation) return toast.error("This device can't share its location");
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        setSite({
                          ...siteForm,
                          site_lat: pos.coords.latitude.toFixed(6),
                          site_lng: pos.coords.longitude.toFixed(6),
                        });
                        toast.success("Coordinates captured — save to keep them");
                      },
                      () => toast.error("Couldn't read this device's location"),
                    );
                  }}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1.5" />Use my location
                </Button>
                {job.site_lat != null && job.site_lng != null && (
                  <a
                    className="text-xs text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${job.site_lat},${job.site_lng}`}
                  >
                    Get directions to site
                  </a>
                )}
                <span className="text-xs text-muted-foreground">
                  {job.site_lat != null ? `${Number(job.site_lat).toFixed(5)}, ${Number(job.site_lng).toFixed(5)}` : "No coordinates yet — saving an address locates the site automatically"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Customer: {job.customer?.company_name ?? "—"} {job.account_number ? `· ${job.account_number}` : ""} · Engineer: {data.assignee ?? "unassigned"}
              </p>
            </div>
          </DetailCard>

          <DetailCard title="Configuration & notes">
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Network configuration (IPs, VLANs, SSIDs)</Label>
                <Textarea rows={4} value={siteForm.network_config} onChange={(e) => setField("network_config", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Installation notes</Label>
                <Textarea rows={3} value={siteForm.installation_notes} onChange={(e) => setField("installation_notes", e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Testing results</Label>
                <Textarea rows={3} value={siteForm.testing_notes} onChange={(e) => setField("testing_notes", e.target.value)} /></div>
              <Button onClick={() => saveDetails.mutate()} disabled={saveDetails.isPending}>
                {saveDetails.isPending ? "Saving…" : "Save job details"}
              </Button>
            </div>
          </DetailCard>
        </TabsContent>

        <TabsContent value="requirements" className="mt-4">
          <DetailCard title="Technical requirements">
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <Input
                className="flex-1"
                placeholder="e.g. Ubiquiti U6 access point"
                value={reqLabel}
                onChange={(e) => setReqLabel(e.target.value)}
              />
              <Input className="w-24" type="number" min={1} value={reqQty} onChange={(e) => setReqQty(e.target.value)} />
              <Button onClick={() => addReq.mutate()} disabled={!reqLabel.trim() || addReq.isPending}>Add</Button>
            </div>
            <DataGrid
              rows={requirements}
              empty={<EmptyState title="No requirements captured" description="List what the site needs — APs, switches, firewall, cabling, backup link." />}
              columns={[
                { header: "Requirement", cell: (r: any) => r.label },
                { header: "Qty", align: "right", cell: (r: any) => r.quantity },
                { header: "Matched stock", cell: (r: any) => (r.inventory_item_id ? <StatusBadge tone="success">matched</StatusBadge> : <StatusBadge tone="warning">procure</StatusBadge>) },
                { header: "Planned", cell: (r: any) => (r.fulfilled ? <StatusBadge tone="success">planned</StatusBadge> : <StatusBadge>pending</StatusBadge>) },
                {
                  header: "", align: "right",
                  cell: (r: any) => (
                    <Button size="sm" variant="ghost" onClick={() => rmReq.mutate(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="equipment" className="mt-4">
          <DetailCard title="Equipment allocations" padded={false}>
            <DataGrid
              rows={equipment}
              empty={<EmptyState title="No equipment allocated" description="Plan from requirements or allocate items directly." />}
              columns={[
                { header: "Item", cell: (r: any) => r.description },
                { header: "Qty", align: "right", cell: (r: any) => r.quantity },
                { header: "Serial(s)", cell: (r: any) => r.serial_numbers ?? "—" },
                { header: "Stock", cell: (r: any) => (r.stock_deducted ? <StatusBadge tone="info">deducted</StatusBadge> : <StatusBadge>in store</StatusBadge>) },
                { header: "Status", cell: (r: any) => <StatusBadge tone={toneForStatus(r.status)}>{r.status}</StatusBadge> },
                {
                  header: "", align: "right",
                  cell: (r: any) => (
                    <div className="flex gap-1 justify-end">
                      {r.status === "reserved" && <Button size="sm" variant="outline" onClick={() => equipStatus.mutate({ id: r.id, status: "issued" })}>Issue</Button>}
                      {["reserved", "issued"].includes(r.status) && <Button size="sm" onClick={() => equipStatus.mutate({ id: r.id, status: "installed" })}>Install</Button>}
                      {r.status !== "returned" && <Button size="sm" variant="ghost" onClick={() => equipStatus.mutate({ id: r.id, status: "returned" })}>Return</Button>}
                    </div>
                  ),
                },
              ]}
            />
          </DetailCard>
        </TabsContent>

        <TabsContent value="checklist" className="mt-4">
          <DetailCard title={`Installation checklist (${doneCount}/${checklist.length})`}>
            {!checklist.length ? (
              <EmptyState
                title="No checklist yet"
                description="Generate the standard checklist for this job type, then tick items off on site."
                action={<Button onClick={() => seed.mutate()} disabled={seed.isPending}>Generate checklist</Button>}
              />
            ) : (
              <div className="space-y-2">
                {checklist.map((c: any) => (
                  <label key={c.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
                    <Checkbox checked={c.done} onCheckedChange={(v) => toggle.mutate({ id: c.id, done: !!v })} />
                    <span className={c.done ? "text-sm line-through text-muted-foreground" : "text-sm"}>{c.label}</span>
                    {c.done_at && <span className="ml-auto text-xs text-muted-foreground">{shortDate(c.done_at)}</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Input placeholder="Add a custom step" value={stepLabel} onChange={(e) => setStepLabel(e.target.value)} />
              <Button variant="outline" onClick={() => addStep.mutate()} disabled={!stepLabel.trim()}>Add step</Button>
            </div>
          </DetailCard>
        </TabsContent>

        <TabsContent value="photos" className="mt-4">
          <DetailCard
            title="Site photos"
            action={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ""; }}
                />
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={upload.isPending}>
                  <Camera className="h-3.5 w-3.5 mr-1.5" />{upload.isPending ? "Uploading…" : "Upload photo"}
                </Button>
              </>
            }
          >
            {!photos.length ? (
              <EmptyState title="No photos" description="Capture the rack, cable runs, mounting points and completed work." />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {photos.map((p: any) => (
                  <div key={p.id} className="space-y-1">
                    {p.url ? (
                      <img src={p.url} alt={p.caption ?? "Site photo"} className="w-full h-32 object-cover border border-border" loading="lazy" />
                    ) : (
                      <div className="w-full h-32 bg-muted" />
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground truncate">{shortDate(p.created_at)}</span>
                      <Button size="sm" variant="ghost" onClick={() => delPhoto.mutate(p.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </TabsContent>

        <TabsContent value="signoff" className="mt-4 space-y-4">
          <DetailCard title="Customer sign-off" padded={false}>
            <DataGrid
              rows={signoffs}
              empty={<EmptyState title="Not signed off" description="Capture the customer's acceptance before completing the job." action={<Button onClick={() => setSignOpen(true)}>Capture sign-off</Button>} />}
              columns={[
                { header: "Signed by", cell: (r: any) => r.signed_by_name },
                { header: "Role", cell: (r: any) => r.signed_by_role ?? "—" },
                { header: "Satisfaction", cell: (r: any) => r.satisfaction ?? "—" },
                { header: "Notes", cell: (r: any) => r.notes ?? "—" },
                { header: "When", cell: (r: any) => shortDate(r.signed_at) },
              ]}
            />
          </DetailCard>
          {report && (
            <DetailCard title="Completion report">
              <pre className="text-xs whitespace-pre-wrap font-mono">{report}</pre>
            </DetailCard>
          )}
        </TabsContent>
      </Tabs>

      {/* Allocate equipment */}
      <Dialog open={allocOpen} onOpenChange={setAllocOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Allocate equipment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Stock item</Label>
              <Select value={allocItem} onValueChange={(v) => { setAllocItem(v); setAllocDesc((stock ?? []).find((s: any) => s.id === v)?.name ?? ""); }}>
                <SelectTrigger><SelectValue placeholder="Pick from inventory" /></SelectTrigger>
                <SelectContent>
                  {(stock ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} · {s.quantity} in stock</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={allocDesc} onChange={(e) => setAllocDesc(e.target.value)} placeholder="Or describe non-stock equipment" />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min={1} value={allocQty} onChange={(e) => setAllocQty(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocOpen(false)}>Cancel</Button>
            <Button onClick={() => alloc.mutate()} disabled={alloc.isPending || (!allocItem && !allocDesc.trim())}>Allocate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sign-off */}
      <Dialog open={signOpen} onOpenChange={setSignOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Capture customer sign-off</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Full name</Label><Input value={signName} onChange={(e) => setSignName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Role / position</Label><Input value={signRole} onChange={(e) => setSignRole(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Notes</Label><Textarea value={signNotes} onChange={(e) => setSignNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignOpen(false)}>Cancel</Button>
            <Button onClick={() => sign.mutate()} disabled={!signName.trim() || sign.isPending}>Save sign-off</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Complete job</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Completion notes</Label>
              <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sendReport} onCheckedChange={(v) => setSendReport(!!v)} />
              Email the completion report to the customer
            </label>
            <p className="text-xs text-muted-foreground">
              All checklist steps must be ticked, equipment resolved and the customer sign-off captured before a job can close.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteOpen(false)}>Cancel</Button>
            <Button onClick={() => complete.mutate()} disabled={complete.isPending}>
              {complete.isPending ? "Completing…" : "Complete job"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
