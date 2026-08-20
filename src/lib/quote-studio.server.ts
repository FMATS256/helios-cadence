/**
 * Quote Studio integration (Block 8)
 * ==================================
 * Server-only client for the external Quote Studio document API.
 *
 * Configuration lives entirely in secrets — never in code:
 *   QUOTE_STUDIO_URL      base URL, e.g. https://studio.example.com/api
 *   QUOTE_STUDIO_API_KEY  bearer token
 *   QUOTE_STUDIO_ORG_ID   optional tenant/organisation id
 *
 * When the secrets are missing every call resolves to `configured: false`
 * so the platform degrades to local quoting instead of throwing at staff.
 */

export type StudioResult<T = any> =
  | { configured: false; ok: false; error: string }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string };

export const STUDIO_NOT_CONFIGURED =
  "Quote Studio is not connected. Add the QUOTE_STUDIO_URL and QUOTE_STUDIO_API_KEY secrets to enable document generation.";

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

async function request<T = any>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: any,
): Promise<StudioResult<T>> {
  const cfg = studioConfig();
  if (!cfg.configured) return { configured: false, ok: false, error: STUDIO_NOT_CONFIGURED };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${cfg.url}${path}`, {
      method,
      headers: {
        "x-api-key": cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cfg.org ? { "X-Organization-Id": cfg.org } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) {
      return { configured: true, ok: false, error: `Quote Studio ${res.status}: ${text.slice(0, 300)}` };
    }
    if (!text) return { configured: true, ok: true, data: {} as T };
    try {
      return { configured: true, ok: true, data: JSON.parse(text) as T };
    } catch {
      return { configured: true, ok: false, error: "Quote Studio returned a non-JSON response" };
    }
  } catch (e: any) {
    clearTimeout(timer);
    const msg = e?.name === "AbortError" ? "Quote Studio request timed out" : (e?.message ?? "Quote Studio request failed");
    return { configured: true, ok: false, error: msg };
  }
}

/* ------------------------------------------------------------------ *
 * Document payload
 * ------------------------------------------------------------------ */

export type StudioItem = {
  id?: string;
  name: string;
  description?: string | null;
  qty: number;
  unitPrice: number;
  total?: number | null;
};

export type StudioDocumentInput = {
  type: "quotation";
  reference: string;
  title: string;
  currency: string;
  valid_until?: string | null;
  notes?: string | null;
  status?: string | null;
  buyer: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    contact?: string | null;
  };
  items: StudioItem[];
  totals?: { subtotal: number; tax: number; total: number };
  metadata?: Record<string, any>;
};

/** Build the Studio payload from a quote row + its line items. */
export function buildDocumentPayload(quote: any, lines: any[]): StudioDocumentInput {
  const items: StudioItem[] = (lines ?? []).map((l, i) => ({
    id: String(l.id ?? i + 1),
    name: l.description ?? "Item",
    description: l.description ?? null,
    qty: Number(l.quantity ?? 1),
    unitPrice: Number(l.unit_price ?? 0),
    total: Number(l.line_total ?? Number(l.quantity ?? 1) * Number(l.unit_price ?? 0)),
  }));

  const subtotal = items.length
    ? items.reduce((s, it) => s + (it.total ?? it.qty * it.unitPrice), 0)
    : Number(quote.amount ?? 0);
  const tax = (lines ?? []).reduce(
    (s, l) => s + (Number(l.line_total ?? 0) * Number(l.tax_rate ?? 0)) / 100,
    0,
  );

  const c = quote.customers ?? {};
  return {
    type: "quotation",
    reference: quote.quote_number || `Q-${String(quote.id).slice(0, 8).toUpperCase()}`,
    title: quote.title ?? "Quotation",
    currency: quote.currency ?? "USD",
    valid_until: quote.valid_until ?? null,
    notes: quote.notes ?? null,
    status: quote.status ?? "draft",
    buyer: {
      name: c.company_name ?? quote.account_number ?? "Customer",
      email: c.primary_email ?? null,
      phone: c.primary_phone ?? null,
      address: c.billing_address ?? null,
      contact: c.company_name ?? null,
    },
    items: items.length
      ? items
      : [{ name: quote.title ?? "Quotation", qty: 1, unitPrice: Number(quote.amount ?? 0), total: Number(quote.amount ?? 0) }],
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
  return (
    d?.pdf_url ?? d?.pdfUrl ?? d?.pdf_api_url ?? d?.download_url ?? d?.downloadUrl ??
    d?.links?.pdf ?? d?.view_url ?? d?.viewUrl ?? null
  );
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
 * API surface
 * ------------------------------------------------------------------ */

export const quoteStudio = {
  /** The API root doubles as a health/discovery endpoint. */
  settings: () => request("GET", ""),
  listDocuments: (params: Record<string, string> = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request("GET", `/documents${qs ? `?${qs}` : ""}`);
  },
  getDocument: (id: string) => request("GET", `/documents/${encodeURIComponent(id)}`),
  createDocument: (payload: StudioDocumentInput) => request("POST", "/documents", payload),
  updateDocument: (id: string, payload: StudioDocumentInput) =>
    request("PATCH", `/documents/${encodeURIComponent(id)}`, payload),
  patchDocument: (id: string, patch: Record<string, any>) =>
    request("PATCH", `/documents/${encodeURIComponent(id)}`, patch),
  deleteDocument: (id: string) => request("DELETE", `/documents/${encodeURIComponent(id)}`),
};

