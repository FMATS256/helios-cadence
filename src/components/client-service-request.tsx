import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, ArrowUpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getClientCatalog, submitServiceRequest } from "@/lib/client-portal.functions";
import { requestFieldsFor } from "@/lib/client-service-requests.shared";

export type ServiceRequestMode = { type: "add" | "upgrade" | "quote"; category?: string; current?: string } | null;

const money = (n: number, c = "USD") => `${c} ${Number(n).toFixed(2)}`;
const label = (c: string) => c.replaceAll("-", " ").replace(/\b\w/g, (m) => m.toUpperCase());

export function ServiceRequestDialog({ mode, onClose }: { mode: ServiceRequestMode; onClose: () => void }) {
  const fetchCatalog = useServerFn(getClientCatalog); const send = useServerFn(submitServiceRequest); const cache = useQueryClient();
  const catalog = useQuery({ queryKey: ["client-catalog"], queryFn: () => fetchCatalog(), enabled: !!mode, staleTime: 300_000 });
  const [category, setCategory] = useState<string | null>(null); const [itemId, setItemId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, string>>({}); const [qty, setQty] = useState(1); const [notes, setNotes] = useState(""); const [busy, setBusy] = useState(false);
  const rows = catalog.data ?? [];
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category))], [rows]);
  const activeCategory = mode?.type === "upgrade" ? mode.category ?? null : category;
  const items = rows.filter((r) => !activeCategory || r.category === activeCategory);
  const item = rows.find((r) => r.id === itemId) ?? null;
  const fields = item ? requestFieldsFor(item.category) : [];
  const close = () => { setCategory(null); setItemId(null); setDetails({}); setQty(1); setNotes(""); onClose(); };
  const title = mode?.type === "upgrade" ? "Upgrade plan" : mode?.type === "quote" ? "Request a quotation" : "Add a service";
  const showCategories = mode?.type !== "upgrade" && !category;

  return <Dialog open={!!mode} onOpenChange={(v) => !v && close()}><DialogContent className="max-h-[90dvh] overflow-y-auto">
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{mode?.type === "upgrade" ? `Packages available for ${mode.current ?? "your service"}. Your account manager confirms the change before it takes effect.` : "Your account manager reviews every request before anything is billed."}</DialogDescription></DialogHeader>
    {catalog.isPending ? <p className="text-sm text-muted-foreground py-6">Loading services…</p> : catalog.error ? <p role="alert" className="text-sm py-6">{catalog.error.message}</p> :
    showCategories && !(mode?.type === "quote" && itemId === "custom") ? <div className="space-y-3">
      <p className="text-sm font-medium">Choose a category</p>
      <div className="grid grid-cols-2 gap-2">{categories.map((c) => <Button key={c} variant="outline" className="h-auto py-4 whitespace-normal" onClick={() => setCategory(c)}>{label(c)}</Button>)}</div>
      {mode?.type === "quote" && <Button variant="ghost" className="w-full" onClick={() => setItemId("custom")}>Something else — describe what you need</Button>}
    </div> : <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault(); if (!item && mode?.type !== "quote") return toast.error("Choose a package");
      setBusy(true);
      try {
        const r = await send({ data: { type: mode!.type, catalog_id: item?.id ?? null, current_service: mode?.current ?? null, quantity: qty, details, notes: notes.trim() } });
        await cache.invalidateQueries({ queryKey: ["client-portal-data"] });
        toast.success(`Request ${r.ticket_number} sent to your account manager`); close();
      } catch (err) { toast.error(err instanceof Error ? err.message : "Request could not be sent"); } finally { setBusy(false); }
    }}>
      {mode?.type !== "upgrade" && <Button type="button" variant="ghost" size="sm" onClick={() => { setCategory(null); setItemId(null); setDetails({}); }}>← All categories{category ? ` · ${label(category)}` : ""}</Button>}
      {itemId !== "custom" && <fieldset className="space-y-2"><legend className="text-sm font-medium mb-1">Choose a package</legend>
        {!items.length ? <p className="text-sm text-muted-foreground">No packages listed here yet — add notes below and we'll quote you.</p> : items.map((r) => <button key={r.id} type="button" role="radio" aria-checked={itemId === r.id} onClick={() => setItemId(r.id)} className={`w-full text-left rounded-lg border-2 p-3 transition-colors ${itemId === r.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}>
          <span className="flex justify-between gap-3"><span className="font-semibold">{r.name}</span><span className="text-sm whitespace-nowrap">{money(r.unit_price, r.currency)}<span className="text-muted-foreground"> / {r.billing_cycle}</span></span></span>
          {r.description && <span className="block text-xs text-muted-foreground mt-1">{r.description}</span>}
          {mode?.type === "upgrade" && itemId === r.id && <span className="flex items-center gap-1 text-xs text-primary mt-2"><ArrowUpCircle className="h-3 w-3" />Selected for upgrade</span>}
        </button>)}
      </fieldset>}
      {item && <div className="space-y-2"><Label htmlFor="req-qty">Quantity</Label><Input id="req-qty" type="number" min={1} max={10000} value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} /></div>}
      {fields.map((f) => <div key={f.key} className="space-y-2"><Label htmlFor={`req-${f.key}`}>{f.label}{f.required && " *"}</Label>
        {f.type === "textarea" ? <Textarea id={`req-${f.key}`} rows={3} required={f.required} placeholder={f.placeholder} value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} />
          : <Input id={`req-${f.key}`} type={f.type ?? "text"} required={f.required} placeholder={f.placeholder} value={details[f.key] ?? ""} onChange={(e) => setDetails({ ...details, [f.key]: e.target.value })} />}</div>)}
      {item && (item.category.includes("email") || item.category === "m365" || item.category === "productivity") && <p className="text-xs text-muted-foreground">For security, passwords are never entered here — we send each user a secure temporary password.</p>}
      <div className="space-y-2"><Label htmlFor="req-notes">{itemId === "custom" ? "Describe what you need *" : "Notes"}</Label><Textarea id="req-notes" rows={3} required={itemId === "custom"} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      {item && <p className="text-sm font-semibold">Estimated: {money(item.unit_price * qty, item.currency)} / {item.billing_cycle}</p>}
      <Button type="submit" disabled={busy} className="w-full"><Send className="h-4 w-4 mr-2" />{busy ? "Sending…" : mode?.type === "upgrade" ? "Request upgrade" : mode?.type === "quote" ? "Request quotation" : "Request service"}</Button>
    </form>}
  </DialogContent></Dialog>;
}

export function ServiceDetailDialog({ detail, onClose, onUpgrade, onSupport }: { detail: { kind: string; title: string; status: string; rows: Array<[string, any]>; category?: string } | null; onClose: () => void; onUpgrade: () => void; onSupport: () => void }) {
  return <Dialog open={!!detail} onOpenChange={(v) => !v && onClose()}><DialogContent>
    {detail && <><DialogHeader><DialogTitle>{detail.title}</DialogTitle><DialogDescription>{detail.kind} · {detail.status}</DialogDescription></DialogHeader>
      <dl className="divide-y divide-border text-sm">{detail.rows.filter(([, v]) => v != null && v !== "").map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">{k}</dt><dd className="font-semibold text-right break-words">{v}</dd></div>)}</dl>
      <div className="flex flex-wrap gap-2">{detail.category && <Button onClick={onUpgrade}><ArrowUpCircle className="h-4 w-4 mr-2" />Upgrade plan</Button>}<Button variant="outline" onClick={onSupport}>Get support</Button></div></>}
  </DialogContent></Dialog>;
}
