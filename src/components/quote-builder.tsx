import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveQuote, getQuoteDetail, getQuotePdf, listQuoteSources } from "@/lib/quotes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Eye, Save, Loader2, Building2, Download, UserPlus, PackageSearch, Search } from "lucide-react";
import { toast } from "sonner";
import { QuotationPreview } from "./quotation-preview";
import { quotationDocument } from "@/lib/quotation-document.shared";
import { INDUSTRY_BUNDLES, resolveBundle } from "@/lib/industry-bundles.shared";

export interface QuoteLineDraft {
  description: string;
  item_code?: string;
  billing_period_start?: string;
  billing_period_end?: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

const emptyLine = (): QuoteLineDraft => ({ description: "", quantity: "1", unit_price: "0", tax_rate: "15.5" });

const fmt = (n: number, cur: string) =>
  `${cur} ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function QuoteBuilderDialog({
  open,
  onOpenChange,
  customers,
  quoteId,
  defaultCustomerId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: any[];
  quoteId?: string | null;
  defaultCustomerId?: string;
  onSaved?: (id: string) => void;
}) {
  const save = useServerFn(saveQuote);
  const detailFn = useServerFn(getQuoteDetail);
  const pdfFn = useServerFn(getQuotePdf);
  const sourcesFn = useServerFn(listQuoteSources);


  const [tab, setTab] = useState("details");
  const [walkIn, setWalkIn] = useState(false);
  const [form, setForm] = useState<any>({
    customer_id: defaultCustomerId ?? "",
    walkin_name: "",
    walkin_email: "",
    walkin_phone: "",
    walkin_address: "",
    quote_number: "",
    title: "",
    currency: "USD",
    valid_until: "",
    discount: "0",
    notes: "",
  });
  const [lines, setLines] = useState<QuoteLineDraft[]>([emptyLine()]);
  const [savedId, setSavedId] = useState<string | null>(quoteId ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [pdfFile, setPdfFile] = useState<{ name: string; url: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerKind, setPickerKind] = useState<"all" | "catalog" | "stock">("all");

  const { data: sources, isLoading: sourcesLoading } = useQuery({
    queryKey: ["quote-sources"],
    queryFn: () => sourcesFn({}),
    enabled: open,
    staleTime: 60_000,
  });

  const pickerRows = useMemo(() => {
    const all: any[] = [...((sources as any)?.catalog ?? []), ...((sources as any)?.stock ?? [])];
    const q = pickerQuery.trim().toLowerCase();
    return all
      .filter((r) => (pickerKind === "all" ? true : r.kind === pickerKind))
      .filter((r) =>
        !q ||
        [r.name, r.code, r.category].filter(Boolean).some((v: string) => String(v).toLowerCase().includes(q)),
      )
      .slice(0, 300);
  }, [sources, pickerQuery, pickerKind]);


  // Load an existing quotation for editing.
  const { data: existing } = useQuery({
    queryKey: ["quote-builder", quoteId],
    queryFn: () => { if (!quoteId) throw new Error("Quotation not selected"); return detailFn({ data: { id: quoteId } }); },
    enabled: !!quoteId && open,
  });

  useEffect(() => {
    if (!open) return;
    if (existing?.quote) {
      const q: any = existing.quote;
      setWalkIn(!q.customer_id);
      setForm({
        customer_id: q.customer_id ?? "",
        walkin_name: q.walkin_name ?? "",
        walkin_email: q.walkin_email ?? "",
        walkin_phone: q.walkin_phone ?? "",
        walkin_address: q.walkin_address ?? "",
        quote_number: q.quote_number ?? "",
        title: q.title ?? "",
        currency: q.currency ?? "USD",
        valid_until: q.valid_until ?? "",
        discount: "0",
        notes: q.notes ?? "",
      });
      setLines(
        (existing.lines ?? []).length
          ? (existing.lines as any[]).map((l) => ({
              description: l.description ?? "",
              item_code: l.item_code ?? "",
              billing_period_start: l.billing_period_start ?? "",
              billing_period_end: l.billing_period_end ?? "",
              quantity: String(l.quantity ?? 1),
              unit_price: String(l.unit_price ?? 0),
              tax_rate: String(l.tax_rate ?? 0),
            }))
          : [emptyLine()],
      );
      setSavedId(q.id);
    }
  }, [existing, open]);

  // Selected customer profile — shown so the rep can confirm what prints.
  const { data: customer } = useQuery({
    queryKey: ["quote-customer", form.customer_id],
    enabled: !!form.customer_id && !walkIn,
    queryFn: async () =>
      (
        await supabase
          .from("customers")
          .select("id,account_number,company_name,primary_email,primary_phone,billing_address")
          .eq("id", form.customer_id)
          .maybeSingle()
      ).data,
  });

  const totals = useMemo(() => {
    const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0);
    const tax = lines.reduce(
      (s, l) => s + ((Number(l.quantity) || 0) * (Number(l.unit_price) || 0) * (Number(l.tax_rate) || 0)) / 100,
      0,
    );
    const discount = Number(form.discount) || 0;
    return { subtotal, tax, discount, total: subtotal + tax - discount };
  }, [lines, form.discount]);

  const setLine = (i: number, patch: Partial<QuoteLineDraft>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addFromSource = (row: any) => {
    const desc = [row.name, row.code ? `(${row.code})` : null].filter(Boolean).join(" ");
    const suffix = row.billing_cycle && row.billing_cycle !== "one_time" ? ` — ${String(row.billing_cycle).replace(/_/g, " ")}` : "";
    const draft: QuoteLineDraft = {
      description: desc + suffix,
      item_code: row.code ?? "",
      quantity: "1",
      unit_price: String(row.price ?? 0),
      tax_rate: "15.5",
    };
    setLines((prev) => {
      const blank = prev.length === 1 && !prev[0].description.trim() && !Number(prev[0].unit_price);
      return blank ? [draft] : [...prev, draft];
    });
    if (row.currency && row.currency !== form.currency) {
      toast.message(`${row.name} is priced in ${row.currency}`, { description: `Quotation currency is ${form.currency}.` });
    } else {
      toast.success(`${row.name} added`);
    }
    setTab("items");
  };

  const addBundle = (key: string) => {
    const bundle = INDUSTRY_BUNDLES.find((b) => b.key === key);
    if (!bundle) return;
    const { lines: rows, missing, monthly } = resolveBundle(bundle, (sources as any)?.catalog ?? []);
    if (!rows.length) { toast.error(`${bundle.name}: none of its products are on sale`); return; }
    const drafts: QuoteLineDraft[] = rows.map(({ row, qty }: any) => {
      const suffix = row.billing_cycle && row.billing_cycle !== "one_time" ? ` — ${String(row.billing_cycle).replace(/_/g, " ")}` : "";
      return { item_code: row.code, description: `${row.name} (${row.code})${suffix}`, quantity: String(qty), unit_price: String(row.price ?? 0), tax_rate: "15.5" };
    });
    setLines((prev) => {
      const blank = prev.length === 1 && !prev[0].description.trim() && !Number(prev[0].unit_price);
      return blank ? drafts : [...prev, ...drafts];
    });
    setForm((f: any) => ({
      ...f,
      title: f.title || `${bundle.name} — ${bundle.market}`,
      notes: f.notes?.includes(bundle.notes) ? f.notes : [f.notes, bundle.notes].filter(Boolean).join("\n"),
    }));
    if (missing.length) toast.warning(`${bundle.name} added without: ${missing.join(", ")}`, { description: "These products aren't on sale in the catalogue." });
    else toast.success(`${bundle.name} added`, { description: `${fmt(monthly, form.currency)} before discount` });
  };


  const reset = () => {
    setWalkIn(false);
    setPdfFile(null);
    setForm({ customer_id: defaultCustomerId ?? "", walkin_name: "", walkin_email: "", walkin_phone: "", walkin_address: "", quote_number: "", title: "", currency: "USD", valid_until: "", discount: "0", notes: "" });
    setLines([emptyLine()]);
    setSavedId(null);
    setPreviewUrl(null);
    setTab("details");
  };

  const persist = useMutation({
    mutationFn: async () =>
      await save({
        data: {
          id: savedId ?? undefined,
          customer_id: walkIn ? null : form.customer_id,
          walk_in: walkIn
            ? {
                name: form.walkin_name,
                email: form.walkin_email || null,
                phone: form.walkin_phone || null,
                address: form.walkin_address || null,
              }
            : null,
          quote_number: form.quote_number || undefined,
          title: form.title,
          currency: form.currency,
          valid_until: form.valid_until || null,
          notes: form.notes || null,
          discount: Number(form.discount) || 0,
          lines: lines.map((l) => ({
            description: l.description,
            item_code: l.item_code || undefined,
            billing_period_start: l.billing_period_start || null,
            billing_period_end: l.billing_period_end || null,
            quantity: Number(l.quantity) || 0,
            unit_price: Number(l.unit_price) || 0,
            tax_rate: Number(l.tax_rate) || 0,
          })),
        },
      }),
    onSuccess: (res: any) => {
      setSavedId(res.id);
      if (!form.quote_number && res.quote_number) setForm((f: any) => ({ ...f, quote_number: res.quote_number }));
      toast.success(`Quotation ${res.quote_number ?? ""} saved`);
      onSaved?.(res.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function buildPdf() {
    const res: any = await persist.mutateAsync();
    const file: any = await pdfFn({ data: { id: res.id } });
    const bin = atob(file.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    setPreviewUrl(url);
    const name = file.filename ?? "quotation.pdf";
    setPdfFile({ name, url });
    return { name, url };
  }

  async function preview() {
    setPreviewing(true);
    try {
      await buildPdf();
      setTab("preview");
    } catch (e: any) {
      toast.error(e.message ?? "Preview failed");
    } finally {
      setPreviewing(false);
    }
  }

  async function downloadPdf() {
    setDownloading(true);
    try {
      const { name, url } = await buildPdf();
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Quotation PDF downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Could not generate the PDF");
    } finally {
      setDownloading(false);
    }
  }


  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v && !quoteId) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{quoteId || savedId ? "Edit quotation" : "Create quotation"}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="details">Customer &amp; details</TabsTrigger>
            <TabsTrigger value="items">Line items</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={walkIn ? "outline" : "default"} onClick={() => setWalkIn(false)}>
                  <Building2 className="h-4 w-4 mr-1.5" />Existing customer
                </Button>
                <Button type="button" size="sm" variant={walkIn ? "default" : "outline"} onClick={() => setWalkIn(true)}>
                  <UserPlus className="h-4 w-4 mr-1.5" />Walk-in client
                </Button>
              </div>

              {!walkIn && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Customer *</Label>
                  <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.account_number} · {c.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {walkIn && (
                <>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Client name *</Label>
                    <Input value={form.walkin_name} onChange={(e) => setForm({ ...form, walkin_name: e.target.value })} placeholder="John Moyo / Acme Traders" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={form.walkin_email} onChange={(e) => setForm({ ...form, walkin_email: e.target.value })} placeholder="client@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={form.walkin_phone} onChange={(e) => setForm({ ...form, walkin_phone: e.target.value })} placeholder="+263 …" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Address</Label>
                    <Input value={form.walkin_address} onChange={(e) => setForm({ ...form, walkin_address: e.target.value })} placeholder="Street, city" />
                  </div>
                </>
              )}

              {!walkIn && customer && (
                <div className="sm:col-span-2 rounded-xl border bg-muted/10 p-4 text-sm">
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> Bill to
                  </div>
                  <div className="grid gap-1 sm:grid-cols-2">
                    <div className="font-semibold">{customer.company_name}</div>
                    <div className="font-mono text-xs text-muted-foreground">{customer.account_number}</div>
                    <div>{customer.primary_email || "No email on file"}</div>
                    <div>{customer.primary_phone || "No phone on file"}</div>
                    <div className="sm:col-span-2 text-muted-foreground">
                      {[customer.billing_address].filter(Boolean).join(", ") || "No billing address"}
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2 sm:col-span-2">
                <Label>Quotation title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Managed Cloud VPS Package" />
              </div>
              <div className="space-y-2">
                <Label>Quote number</Label>
                <Input value={form.quote_number} onChange={(e) => setForm({ ...form, quote_number: e.target.value })} placeholder="Auto-generated" />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Input value={form.currency} maxLength={3} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-2">
                <Label>Valid until</Label>
                <Input type="date" value={form.valid_until ?? ""} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Discount ({form.currency})</Label>
                <Input type="number" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notes / terms</Label>
                <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Payment terms, scope notes, exclusions…" />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="items" className="space-y-3 pt-4">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left">Description</th>
                    <th className="p-2 text-right w-20">Qty</th>
                    <th className="p-2 text-right w-32">Unit price</th>
                    <th className="p-2 text-right w-20">Tax %</th>
                    <th className="p-2 text-right w-32">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="p-2">
                        <Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Item description" />
                        <Input className="mt-1" aria-label={`Item code ${i + 1}`} value={l.item_code ?? ""} onChange={(e) => setLine(i, { item_code: e.target.value })} placeholder="Item Code / SKU" />
                        <div className="mt-1 flex gap-1">
                          <Input aria-label={`Service period start ${i + 1}`} title="Service period start (optional)" type="date" value={l.billing_period_start ?? ""} onChange={(e) => setLine(i, { billing_period_start: e.target.value })} />
                          <Input aria-label={`Service period end ${i + 1}`} title="Service period end (optional)" type="date" value={l.billing_period_end ?? ""} onChange={(e) => setLine(i, { billing_period_end: e.target.value })} />
                        </div>
                      </td>
                      <td className="p-2"><Input className="text-right" type="number" step="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                      <td className="p-2"><Input className="text-right" type="number" step="0.01" value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                      <td className="p-2"><Input className="text-right" type="number" step="0.01" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} /></td>
                      <td className="p-2 text-right font-mono">
                        {fmt((Number(l.quantity) || 0) * (Number(l.unit_price) || 0), form.currency)}
                      </td>
                      <td className="p-2 text-right">
                        <Button type="button" size="icon" variant="ghost" onClick={() => setLines((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                <PackageSearch className="h-4 w-4 mr-1.5" />Pick from catalog &amp; stock
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="h-4 w-4 mr-1.5" />Add blank line
              </Button>
              <Select value="" onValueChange={addBundle} disabled={sourcesLoading}>
                <SelectTrigger className="h-9 w-auto min-w-[200px]"><SelectValue placeholder="Add industry bundle…" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRY_BUNDLES.map((b) => (
                    <SelectItem key={b.key} value={b.key}>{b.name} · {b.market}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>


            <div className="ml-auto w-full max-w-xs space-y-1 rounded-xl border bg-muted/10 p-4 text-sm">
              <Row label="Subtotal" value={fmt(totals.subtotal, form.currency)} />
              <Row label="Tax" value={fmt(totals.tax, form.currency)} />
              <Row label="Discount" value={`- ${fmt(totals.discount, form.currency)}`} />
              <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
                <span>Total</span><span className="font-mono">{fmt(totals.total, form.currency)}</span>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview" className="pt-4">
            <QuotationPreview document={quotationDocument({ ...form, amount: totals.total, created_at: existing?.quote?.created_at ?? new Date().toISOString(), customers: walkIn ? undefined : customer, account_number: walkIn ? null : customer?.account_number }, lines, existing?.representative?.name ?? "IMT Solutions")} />
            {previewUrl ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" asChild>
                    <a href={pdfFile?.url ?? previewUrl} download={pdfFile?.name ?? "quotation.pdf"}>
                      <Download className="h-4 w-4 mr-1.5" />Download PDF
                    </a>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => { if (previewUrl) window.open(previewUrl, "_blank"); }}>
                    <Eye className="h-4 w-4 mr-1.5" />Open in new tab
                  </Button>
                </div>
                <iframe title="Quotation PDF" src={previewUrl} className="h-[60vh] w-full rounded-sm border" />
              </div>
            ) : (
              null
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" disabled={previewing || persist.isPending} onClick={preview}>
            {previewing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Eye className="h-4 w-4 mr-1.5" />}
            Save &amp; preview
          </Button>
          <Button variant="outline" disabled={downloading || previewing || persist.isPending} onClick={downloadPdf}>
            {downloading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Download PDF
          </Button>

          <Button
            disabled={persist.isPending}
            className="text-solar-foreground"
            style={{ background: "var(--gradient-solar)" }}
            onClick={() => persist.mutate()}
          >
            <Save className="h-4 w-4 mr-1.5" />{persist.isPending ? "Saving…" : "Save quotation"}
          </Button>
        </DialogFooter>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>Add from catalog &amp; stock</DialogTitle>
              <DialogDescription>Service packages from the catalog and hardware currently in inventory.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Search name, SKU, code…" value={pickerQuery} onChange={(e) => setPickerQuery(e.target.value)} />
              </div>
              {(["all", "catalog", "stock"] as const).map((k) => (
                <Button key={k} type="button" size="sm" variant={pickerKind === k ? "default" : "outline"} onClick={() => setPickerKind(k)}>
                  {k === "all" ? "All" : k === "catalog" ? "Packages & services" : "Hardware in stock"}
                </Button>
              ))}
            </div>
            <div className="mt-2 flex-1 overflow-y-auto rounded-xl border divide-y">
              {sourcesLoading && <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>}
              {!sourcesLoading && pickerRows.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">Nothing matches that search.</div>
              )}
              {pickerRows.map((r: any) => {
                const out = r.kind === "stock" && (r.stock ?? 0) <= 0;
                return (
                  <button
                    key={`${r.kind}-${r.id}`}
                    type="button"
                    onClick={() => addFromSource(r)}
                    className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{r.name}</span>
                        <Badge variant={r.kind === "stock" ? "secondary" : "outline"} className="text-[10px] uppercase">
                          {r.kind === "stock" ? "Stock" : r.category}
                        </Badge>
                        {r.kind === "stock" && (
                          <Badge variant={out ? "destructive" : "outline"} className="text-[10px]">
                            {out ? "Out of stock" : `${r.stock} in stock`}
                          </Badge>
                        )}
                        {r.billing_cycle && r.billing_cycle !== "one_time" && (
                          <Badge variant="outline" className="text-[10px]">{String(r.billing_cycle).replace(/_/g, " ")}</Badge>
                        )}
                      </div>
                      {(r.code || r.description) && (
                        <div className="truncate text-xs text-muted-foreground">
                          {[r.code, r.description].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 font-mono text-sm">{fmt(r.price, r.currency || form.currency)}</div>
                  </button>
                );
              })}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPickerOpen(false)}>Done</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>

  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-muted-foreground">
      <span>{label}</span><span className="font-mono text-foreground">{value}</span>
    </div>
  );
}
