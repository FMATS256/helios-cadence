import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusPill } from "@/components/page";

export type ServiceDetailKind = "Subscription" | "Service" | "Package" | "Asset" | "Credential";
export type ServiceDetail = { kind: ServiceDetailKind; title: string; lineLabel: string; record: any };

const HIDDEN = /(^id$|_id$|password|secret|token|encrypted|cipher|hash|private_key|api_key)/i;

function label(k: string) {
  return k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmt(k: string, v: any): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string" && /(_at|_date|renewal|expires|start|end)$/i.test(k) && !isNaN(Date.parse(v))) {
    return new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }
  if (typeof v === "object") return "";
  return String(v);
}

function flatten(rec: any): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(rec || {})) {
    if (HIDDEN.test(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as any)) {
        if (HIDDEN.test(k2)) continue;
        const s = fmt(k2, v2);
        if (s) out.push([`${label(k)} · ${label(k2)}`, s]);
      }
      continue;
    }
    const s = fmt(k, v);
    if (s) out.push([label(k), s]);
  }
  return out;
}

export function ServiceDetailDialog({ detail, onClose }: { detail: ServiceDetail | null; onClose: () => void }) {
  const rec = detail?.record || {};
  const status = rec.status || (detail?.kind === "Asset" ? "in use" : "active");
  const rows = flatten(rec).filter(([k]) => k !== "Status");
  return (
    <Dialog open={!!detail} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{detail?.lineLabel} · {detail?.kind}</p>
          <DialogTitle className="font-display flex items-center gap-2 flex-wrap">
            {detail?.title}
            <StatusPill tone={status === "active" ? "success" : status === "paused" ? "warning" : "neutral"}>{status}</StatusPill>
          </DialogTitle>
        </DialogHeader>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No further details recorded.</p>
        ) : (
          <dl className="divide-y border rounded">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-[minmax(0,40%)_1fr] gap-3 px-3 py-2 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-medium break-words">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
