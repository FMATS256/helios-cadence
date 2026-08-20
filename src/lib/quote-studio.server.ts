/**
 * IMT Sales / Quotation Engine integration (headless).
 * =====================================================
 * Server-only client for the headless quotation engine
 * ("IMT Solutions Sales API", /api/public/v1).
 *
 * There is no end-user login on the engine: this platform is the master
 * system and authenticates with an API key, passing the acting staff member
 * through identity headers so the engine can attribute documents.
 *
 * Configuration lives entirely in secrets — never in code:
 *   QUOTE_STUDIO_URL      base URL, e.g. https://engine.example.com
 *   QUOTE_STUDIO_API_KEY  bearer token
 *   QUOTE_STUDIO_ORG_ID   optional tenant/organisation id
 */

export type StudioResult<T = any> =
  | { configured: false; ok: false; error: string }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string };

export const STUDIO_NOT_CONFIGURED =
  "The quotation engine is not connected. Add the QUOTE_STUDIO_URL and QUOTE_STUDIO_API_KEY secrets to enable document generation.";

/** Engine document lifecycle. */
export const STUDIO_STATUSES = ["draft", "pending_approval", "approved", "sent", "final"] as const;
export type StudioStatus = (typeof STUDIO_STATUSES)[number];

/** Map an internal quote status onto the engine lifecycle. */
export function toStudioStatus(status: string | null | undefined): StudioStatus {
  switch ((status ?? "").toLowerCase()) {
    case "sent": return "sent";
    case "accepted": return "final";
    case "approved": return "approved";
    case "pending_approval": return "pending_approval";
    default: return "draft";
  }
}

/** Actor attribution forwarded to the engine. */
export type StudioActor = {
  userId?: string | null;
  userName?: string | null;
  tenantId?: string | null;
  companyId?: string | null;
  branchId?: string | null;
};

export function studioConfig() {
  let url = (process.env["QUOTE_STUDIO_URL"] ?? "").replace(/\/+$/, "");
  const key = process.env["QUOTE_STUDIO_API_KEY"] ?? "";
  const org = process.env["QUOTE_STUDIO_ORG_ID"] ?? "";
  // Allow either the app root or the full API path to be stored.
  if (url && !url.endsWith("/api/public/v1")) {
    url = `${url}/api/public/v1`;
  }
  return { url, key, org, configured: Boolean(url && key) };
}

function headers(cfg: ReturnType<typeof studioConfig>, actor?: StudioActor, json?: boolean, accept = "application/json") {
  const h: Record<string, string> = {
    Authorization: `Bearer ${cfg.key}`,
    "x-api-key": cfg.key,
    Accept: accept,
  };
  if (json) h["Content-Type"] = "application/json";
  if (cfg.org) h["X-IMT-Tenant-Id"] = cfg.org;
  if (actor?.userId) h["X-IMT-User-Id"] = String(actor.userId);
  if (actor?.userName) h["X-IMT-User-Name"] = String(actor.userName);
  if (actor?.tenantId) h["X-IMT-Tenant-Id"] = String(actor.tenantId);
  if (actor?.companyId) h["X-IMT-Company-Id"] = String(actor.companyId);
  if (actor?.branchId) h["X-IMT-Branch-Id"] = String(actor.branchId);
  return h;
}

async function request<T = any>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
  actor?: StudioActor,
): Promise<StudioResult<T>> {
  const cfg = studioConfig();
  if (!cfg.configured) return { configured: false, ok: false, error: STUDIO_NOT_CONFIGURED };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: headers(cfg, actor, Boolean(body)),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      return { configured: true, ok: false, error: `Quotation engine ${res.status}: ${text.slice(0, 300)}` };
    }
    if (!text) return { configured: true, ok: true, data: {} as T };
    try {
      const parsed = JSON.parse(text) as any;
      // The engine reports handled failures with 200 + { error }.
      if (parsed && typeof parsed === "object" && parsed.error && !parsed.document && !parsed.documents) {
        return { configured: true, ok: false, error: `Quotation engine: ${String(parsed.error).slice(0, 300)}` };
      }
      return { configured: true, ok: true, data: parsed as T };
    } catch {
      return { configured: true, ok: false, error: "Quotation engine returned a non-JSON response" };
    }
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === "AbortError" ? "Quotation engine request timed out" : (e?.message ?? "Quotation engine request failed");
    return { configured: true, ok: false, error: msg };
  }
}

/** Fetch a binary document (PDF) as bytes. */
async function requestBinary(
  method: "GET" | "POST",
  path: string,
  body?: any,
  actor?: StudioActor,
): Promise<StudioResult<{ bytes: Uint8Array; contentType: string }>> {
  const cfg = studioConfig();
  if (!cfg.configured) return { configured: false, ok: false, error: STUDIO_NOT_CONFIGURED };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45_000);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: headers(cfg, actor, Boolean(body), "application/pdf"),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok || !contentType.includes("pdf")) {
      const text = await res.text();
      return { configured: true, ok: false, error: `Quotation engine ${res.status}: ${text.slice(0, 300)}` };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { configured: true, ok: true, data: { bytes, contentType: "application/pdf" } };
  } catch (e: any) {
    clearTimeout(timer);
    return { configured: true, ok: false, error: e?.message ?? "Quotation engine PDF request failed" };
  }
}

/* ------------------------------------------------------------------ *
 * Document payload
 * ------------------------------------------------------------------ */

export type StudioItem = {
  id?: string;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
  total?: number | null;
  /** Legacy alias kept for engine builds that still read `qty`. */
  qty: number;
};

export type StudioDocumentInput = {
  type: "quotation";
  reference: string;
  externalId?: string | null;
  title: string;
  currency: string;
  status?: StudioStatus;
  validUntil?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    reference?: string | null;
  };
  /** Legacy alias — older builds read `buyer`. */
  buyer: StudioDocumentInput["customer"];
  items: StudioItem[];
  totals?: { subtotal: number; tax: number; total: number };
  metadata?: Record<string, any>;
};

/** Build the engine payload from a quote row + its line items. */
export function buildDocumentPayload(quote: any, lines: any[]): StudioDocumentInput {
  const items: StudioItem[] = (lines ?? []).map((l, i) => {
    const quantity = Number(l.quantity ?? 1);
    const unitPrice = Number(l.unit_price ?? 0);
    return {
      id: String(l.id ?? i + 1),
      name: l.description ?? "Item",
      description: l.description ?? null,
      quantity,
      qty: quantity,
      unitPrice,
      taxRate: Number(l.tax_rate ?? 0),
      total: Number(l.line_total ?? quantity * unitPrice),
    };
  });

  const subtotal = items.length
    ? items.reduce((s, it) => s + (it.total ?? it.quantity * it.unitPrice), 0)
    : Number(quote.amount ?? 0);
  const tax = (lines ?? []).reduce(
    (s, l) => s + (Number(l.line_total ?? 0) * Number(l.tax_rate ?? 0)) / 100,
    0,
  );

  const c = quote.customers ?? {};
  const customer = {
    name: c.company_name ?? quote.account_number ?? "Customer",
    email: c.primary_email ?? null,
    phone: c.primary_phone ?? null,
    address: c.billing_address ?? null,
    reference: quote.account_number ?? null,
  };
  const fallback = {
    name: quote.title ?? "Quotation",
    quantity: 1,
    qty: 1,
    unitPrice: Number(quote.amount ?? 0),
    total: Number(quote.amount ?? 0),
  } satisfies StudioItem;

  return {
    type: "quotation",
    reference: quote.quote_number || `Q-${String(quote.id).slice(0, 8).toUpperCase()}`,
    externalId: String(quote.id),
    title: quote.title ?? "Quotation",
    currency: quote.currency ?? "USD",
    status: toStudioStatus(quote.status),
    validUntil: quote.valid_until ?? null,
    valid_until: quote.valid_until ?? null,
    notes: quote.notes ?? null,
    customer,
    buyer: customer,
    items: items.length ? items : [fallback],
    totals: { subtotal, tax, total: subtotal + tax },
    metadata: { source: "IMT Operations Platform", quote_id: quote.id, account_number: quote.account_number },
  };
}

/** Unwrap the `{ document: {...} }` / `{ data: {...} }` envelopes the API uses. */
function unwrap(doc: any): any {
  return doc?.document ?? doc?.data?.document ?? doc?.data ?? doc ?? {};
}

/** Pull the PDF link out of whatever shape the API returns. */
export function pdfUrlOf(doc: any): string | null {
  const d = unwrap(doc);
  const direct =
    d?.pdf_url ?? d?.pdfUrl ?? d?.pdf_api_url ?? d?.download_url ?? d?.downloadUrl ??
    d?.links?.pdf ?? d?.view_url ?? d?.viewUrl ?? null;
  if (direct) return direct;
  const id = d?.id ?? d?.document_id ?? d?.documentId;
  const cfg = studioConfig();
  return id && cfg.configured ? `${cfg.url}/documents/${encodeURIComponent(String(id))}/pdf` : null;
}

export function documentIdOf(doc: any): string | null {
  const d = unwrap(doc);
  const id = d?.id ?? d?.document_id ?? d?.documentId;
  return id == null ? null : String(id);
}

export function publicUrlOf(doc: any): string | null {
  const d = unwrap(doc);
  return d?.view_url ?? d?.viewUrl ?? d?.public_url ?? d?.publicUrl ?? d?.url ?? null;
}

/* ------------------------------------------------------------------ *
 * API surface (headless engine, /api/public/v1)
 * ------------------------------------------------------------------ */

export const quoteStudio = {
  /** Root doubles as a discovery/health endpoint. */
  settings: () => request("GET", ""),
  me: (actor?: StudioActor) => request("GET", "/me", undefined, actor),

  listDocuments: (params: Record<string, string> = {}, actor?: StudioActor) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/documents${qs ? `?${qs}` : ""}`, undefined, actor);
  },
  getDocument: (id: string, actor?: StudioActor) =>
    request("GET", `/documents/${encodeURIComponent(id)}`, undefined, actor),
  createDocument: (payload: StudioDocumentInput, actor?: StudioActor) =>
    request("POST", "/documents", payload, actor),
  updateDocument: (id: string, payload: StudioDocumentInput, actor?: StudioActor) =>
    request("PATCH", `/documents/${encodeURIComponent(id)}`, payload, actor),
  patchDocument: (id: string, patch: Record<string, any>, actor?: StudioActor) =>
    request("PATCH", `/documents/${encodeURIComponent(id)}`, patch, actor),
  deleteDocument: (id: string, actor?: StudioActor) =>
    request("DELETE", `/documents/${encodeURIComponent(id)}`, undefined, actor),

  /** Lifecycle transitions are first-class on the headless engine. */
  setStatus: (id: string, status: StudioStatus, sentTo?: string | null, actor?: StudioActor) =>
    request("POST", `/documents/${encodeURIComponent(id)}/status`, { status, ...(sentTo ? { sentTo } : {}) }, actor),
  sendDocument: (id: string, sentTo?: string | null, actor?: StudioActor) =>
    request("POST", `/documents/${encodeURIComponent(id)}/send`, sentTo ? { sentTo } : {}, actor),

  /** Stateless helpers — no document is stored. */
  calculate: (payload: Partial<StudioDocumentInput>, actor?: StudioActor) =>
    request("POST", "/calculate", payload, actor),
  preview: (payload: Partial<StudioDocumentInput>, actor?: StudioActor) =>
    request("POST", "/preview", payload, actor),
  renderPdf: (payload: Partial<StudioDocumentInput>, actor?: StudioActor) =>
    requestBinary("POST", "/pdf", payload, actor),
  documentPdf: (id: string, actor?: StudioActor) =>
    requestBinary("GET", `/documents/${encodeURIComponent(id)}/pdf`, undefined, actor),

  /** Engine-side directories. */
  listCustomers: (actor?: StudioActor) => request("GET", "/customers", undefined, actor),
  upsertCustomer: (payload: Record<string, any>, actor?: StudioActor) =>
    request("POST", "/customers", payload, actor),
  listProducts: (actor?: StudioActor) => request("GET", "/products", undefined, actor),
};
