/**
 * Quote Studio — server functions (Block 8).
 * Push / sync / send / accept-reject a quotation. Every mutation validates
 * role + state, talks to the Quote Studio API when configured, and writes an
 * audit row plus a Customer 360 timeline entry.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const QUOTE_ROLES = ["operations_manager", "sales", "finance", "account_manager"];

const QUOTE_SELECT =
  "*, customers(id,account_number,company_name,primary_email,primary_phone,billing_address,account_manager_id)";

/** Identity forwarded to the headless engine for attribution. */
function actorOf(ctx: { userId: string; claims?: any }) {
  const claims: any = ctx.claims ?? {};
  return {
    userId: ctx.userId,
    userName: claims.user_metadata?.full_name ?? claims.email ?? null,
  };
}

/**
 * Sales representative shown on the quotation = the staff member who owns the
 * account (its account manager), falling back to whoever created the quote and
 * finally to the acting user.
 */
async function salesRepOf(db: any, quote: any, ctx: { userId: string; claims?: any }) {
  const ids = [quote.customers?.account_manager_id, quote.created_by, ctx.userId].filter(Boolean);
  for (const id of ids) {
    const { data } = await db
      .from("profiles")
      .select("full_name,email,phone")
      .eq("id", id)
      .maybeSingle();
    const name = (data?.full_name ?? "").trim();
    if (name) return { name, email: data?.email ?? null, phone: (data as any)?.phone ?? null };
  }
  const claims: any = ctx.claims ?? {};
  return {
    name: claims.user_metadata?.full_name ?? claims.email ?? null,
    email: claims.email ?? null,
    phone: null,
  };
}

async function loadQuote(db: any, id: string) {
  const { data, error } = await db.from("quotes").select(QUOTE_SELECT).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Quote not found");
  const { data: lines } = await db
    .from("quote_line_items")
    .select("*")
    .eq("quote_id", id)
    .order("position", { ascending: true });
  return { quote: data, lines: (lines ?? []) as any[] };
}

async function record(
  db: any,
  ctx: { userId: string; claims?: any },
  quote: any,
  opts: { event: string; title: string; description?: string | null; old?: any; new?: any; major?: boolean },
) {
  const { recordCustomerEvent, recordAudit } = await import("./customer-events.server");
  const actor = { actor_id: ctx.userId, actor_email: (ctx.claims as any)?.email ?? null };
  if (quote.customer_id && quote.account_number) {
    await recordCustomerEvent(db, {
      customer_id: quote.customer_id,
      account_number: quote.account_number,
      event_type: opts.event,
      title: opts.title,
      description: opts.description ?? null,
      module: "quotes",
      entity_type: "quotes",
      entity_id: quote.id,
      old_value: opts.old ?? null,
      new_value: opts.new ?? null,
      major: opts.major !== false,
      ...actor,
    });
  } else {
    await recordAudit(db, {
      ...actor,
      action: opts.event,
      entity_type: "quotes",
      entity_id: quote.id,
      account_number: quote.account_number ?? null,
      module: "quotes",
      old_value: opts.old ?? null,
      new_value: opts.new ?? null,
    });
  }
}

/* ------------------------------------------------------------------ *
 * Status / configuration
 * ------------------------------------------------------------------ */

export const quoteStudioStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { studioConfig, quoteStudio } = await import("./quote-studio.server");
    const cfg = studioConfig();
    if (!cfg.configured) return { configured: false, reachable: false, error: null as string | null };
    // Some Studio builds don't expose /settings — fall back to a documents probe.
    let res = await quoteStudio.settings();
    if (!res.ok && /404|Unsupported/i.test((res as any).error ?? "")) {
      res = await quoteStudio.listDocuments({ limit: "1" });
    }
    return {
      configured: true,
      reachable: res.ok,
      error: res.ok ? null : (res as any).error,
    };

  });

export const getQuoteDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { quote, lines } = await loadQuote(context.supabase, data.id);
    const { studioConfig } = await import("./quote-studio.server");
    const representative = await salesRepOf(context.supabase, quote, context);
    return { quote, lines, representative, studio: { configured: studioConfig().configured } };
  });

/** Sellable things a quotation line can be built from: catalog packages/services + hardware in stock. */
export const listQuoteSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase as any;
    const [catR, invR] = await Promise.all([
      db.from("service_catalog")
        .select("id, code, name, category, description, unit_price, currency, billing_cycle, is_active")
        .eq("is_active", true).order("category").order("name"),
      db.from("inventory_items")
        .select("id, name, sku, category, quantity, sale_price, unit_cost")
        .is("archived_at", null).order("name"),
    ]);
    if (catR.error) throw new Error(catR.error.message);
    if (invR.error) throw new Error(invR.error.message);
    return {
      catalog: (catR.data ?? []).map((c: any) => ({
        id: c.id,
        kind: "catalog" as const,
        name: c.name,
        code: c.code,
        category: c.category ?? "service",
        description: c.description ?? null,
        price: Number(c.unit_price) || 0,
        currency: c.currency ?? "USD",
        billing_cycle: c.billing_cycle ?? null,
        stock: null as number | null,
      })),
      stock: (invR.data ?? []).map((i: any) => ({
        id: i.id,
        kind: "stock" as const,
        name: i.name,
        code: i.sku ?? null,
        category: i.category ?? "hardware",
        description: null,
        price: Number(i.sale_price ?? i.unit_cost) || 0,
        currency: "USD",
        billing_cycle: null,
        stock: Number(i.quantity) || 0,
      })),
    };
  });

/* ------------------------------------------------------------------ *
 * Push (create or update the Studio document)
 * ------------------------------------------------------------------ */

export const pushQuoteToStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();
    const { quote, lines } = await loadQuote(db, data.id);
    if (quote.status === "cancelled") throw new Error("Cancelled quotes cannot be pushed to Quote Studio");

    const { quoteStudio, buildDocumentPayload, pdfUrlOf, documentIdOf } = await import("./quote-studio.server");
    const payload = buildDocumentPayload(quote, lines, await salesRepOf(db, quote, context));
    const actor = actorOf(context);
    const res = quote.studio_document_id
      ? await quoteStudio.updateDocument(quote.studio_document_id, payload, actor)
      : await quoteStudio.createDocument(payload, actor);

    if (!res.ok) {
      await db.from("quotes").update({
        studio_status: res.configured ? "failed" : "not_configured",
        studio_error: res.error,
        studio_synced_at: new Date().toISOString(),
      }).eq("id", quote.id);
      throw new Error(res.error);
    }

    const docId = documentIdOf(res.data) ?? quote.studio_document_id;
    const pdf = pdfUrlOf(res.data);
    const patch = {
      studio_document_id: docId,
      studio_pdf_url: pdf ?? quote.studio_pdf_url ?? null,
      studio_status: "synced",
      studio_error: null,
      studio_synced_at: new Date().toISOString(),
    };
    const { error } = await db.from("quotes").update(patch).eq("id", quote.id);
    if (error) throw new Error(error.message);

    await record(db, context, quote, {
      event: quote.studio_document_id ? "quote_document_updated" : "quote_document_created",
      title: `Quote ${quote.quote_number ?? ""} document ${quote.studio_document_id ? "updated" : "generated"}`.trim(),
      description: pdf ? "PDF available in Quote Studio" : null,
      new: patch,
      major: false,
    });
    return patch;
  });

/* ------------------------------------------------------------------ *
 * Sync back from Studio
 * ------------------------------------------------------------------ */

export const syncQuoteFromStudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();
    const { quote } = await loadQuote(db, data.id);
    if (!quote.studio_document_id) throw new Error("This quote has not been pushed to Quote Studio yet");

    const { quoteStudio, pdfUrlOf } = await import("./quote-studio.server");
    const res = await quoteStudio.getDocument(quote.studio_document_id, actorOf(context));
    if (!res.ok) {
      await db.from("quotes").update({
        studio_status: res.configured ? "failed" : "not_configured",
        studio_error: res.error,
        studio_synced_at: new Date().toISOString(),
      }).eq("id", quote.id);
      throw new Error(res.error);
    }

    const remote: any = (res.data as any)?.document ?? res.data;
    const remoteStatus = String(remote?.status ?? "").toLowerCase();
    const patch: Record<string, any> = {
      studio_pdf_url: pdfUrlOf(res.data) ?? quote.studio_pdf_url ?? null,
      studio_status: "synced",
      studio_error: null,
      studio_synced_at: new Date().toISOString(),
    };
    // Studio is authoritative for customer-facing decisions.
    if (["accepted", "approved", "signed", "final"].includes(remoteStatus) && quote.status !== "accepted") {
      patch.status = "accepted";
      patch.accepted_at = new Date().toISOString();
    } else if (["declined", "rejected"].includes(remoteStatus) && quote.status !== "rejected") {
      patch.status = "rejected";
      patch.rejected_at = new Date().toISOString();
    } else if (remoteStatus === "sent" && quote.status === "draft") {
      patch.status = "sent";
      patch.sent_at = quote.sent_at ?? new Date().toISOString();
    }

    const { error } = await db.from("quotes").update(patch).eq("id", quote.id);
    if (error) throw new Error(error.message);

    if (patch.status) {
      await record(db, context, quote, {
        event: `quote_${patch.status}`,
        title: `Quote ${quote.quote_number ?? ""} marked ${patch.status}`.trim(),
        description: "Synchronised from Quote Studio",
        old: { status: quote.status },
        new: { status: patch.status },
      });
    }
    return patch;
  });

/* ------------------------------------------------------------------ *
 * Send to customer
 * ------------------------------------------------------------------ */

export const sendQuoteToCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; email?: string; message?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();
    const { quote, lines } = await loadQuote(db, data.id);
    if (quote.status === "cancelled") throw new Error("Cancelled quotes cannot be sent");

    const to = (data.email || quote.customers?.primary_email || quote.walkin_email || "").trim();
    if (!/@/.test(to)) throw new Error("No customer email on file — enter a recipient address");

    // Make sure a fresh document exists before we email it.
    const { quoteStudio, buildDocumentPayload, pdfUrlOf, documentIdOf, studioConfig } =
      await import("./quote-studio.server");
    let pdfUrl: string | null = quote.studio_pdf_url ?? null;
    let pdfBytes: Uint8Array | null = null;
    let docId: string | null = quote.studio_document_id ?? null;
    let studioError: string | null = null;

    if (studioConfig().configured) {
      const payload = buildDocumentPayload(quote, lines, await salesRepOf(db, quote, context));
      const actor = actorOf(context);
      const res = docId
        ? await quoteStudio.updateDocument(docId, payload, actor)
        : await quoteStudio.createDocument(payload, actor);
      if (res.ok) {
        docId = documentIdOf(res.data) ?? docId;
        pdfUrl = pdfUrlOf(res.data) ?? pdfUrl;
        // Tell the engine the document has gone out so its lifecycle matches ours.
        if (docId) {
          const marked = await quoteStudio.sendDocument(docId, to, actor);
          if (!marked.ok) studioError = marked.error;
          // Fetch the PDF bytes so we can attach it to the email.
          const pdfRes = await quoteStudio.documentPdf(docId, actor);
          if (pdfRes.ok) {
            pdfBytes = pdfRes.data.bytes;
          } else {
            studioError = studioError || pdfRes.error;
          }
        }
      } else {
        studioError = res.error;
      }
    }

    // Attach the same current branded document shown in the quotation preview.
    const { brandedQuotationPdf } = await import("./quotation-document.server");
    const representative = await salesRepOf(db, quote, context);
    pdfBytes = await brandedQuotationPdf(quote, lines, representative.name ?? undefined);

    const items = (lines ?? []).map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity ?? 1),
      unit_price: Number(l.unit_price ?? 0),
      line_total: Number(l.line_total ?? 0),
    }));
    const subtotal = items.length
      ? items.reduce((s: number, l: any) => s + l.line_total, 0)
      : Number(quote.amount ?? 0);

    const attachments = pdfBytes
      ? [
          {
            filename: `Quotation-${quote.quote_number ?? String(quote.id).slice(0, 8).toUpperCase()}.pdf`,
            content: pdfBytes,
            contentType: "application/pdf",
          },
        ]
      : [];

    const { notifyWithAttachment } = await import("./notify.server");
    await notifyWithAttachment(
      "quote",
      to,
      {
        companyName: quote.customers?.company_name ?? quote.walkin_name ?? quote.account_number ?? "there",
        quoteNumber: quote.quote_number ?? "",
        title: quote.title ?? "Quotation",
        issueDate: (quote.created_at ?? "").slice(0, 10),
        validUntil: quote.valid_until ?? undefined,
        currency: quote.currency ?? "USD",
        subtotal,
        tax: 0,
        total: subtotal,
        items,
        quoteUrl: pdfUrl ?? undefined,
        message: data.message ?? undefined,
      },
      attachments,
      `quote-${quote.id}-${Date.now()}`,
    );

    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      status: quote.status === "draft" ? "sent" : quote.status,
      sent_at: now,
      studio_document_id: docId,
      studio_pdf_url: pdfUrl,
      studio_status: studioError ? "failed" : docId ? "synced" : quote.studio_status,
      studio_error: studioError,
      studio_synced_at: docId ? now : quote.studio_synced_at,
    };
    const { error } = await db.from("quotes").update(patch).eq("id", quote.id);
    if (error) throw new Error(error.message);

    await record(db, context, quote, {
      event: "quote_sent",
      title: `Quote ${quote.quote_number ?? ""} sent to ${to}`.trim(),
      description: pdfBytes
        ? "Quotation email delivered with PDF attachment"
        : pdfUrl
          ? "Quotation email delivered with document link"
          : "Quotation email delivered",
      old: { status: quote.status },
      new: { status: patch.status, sent_to: to },
    });

    return { sent_to: to, pdf_url: pdfUrl, studio_error: studioError };
  });

/* ------------------------------------------------------------------ *
 * Decision + lifecycle
 * ------------------------------------------------------------------ */

export const setQuoteOutcome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; outcome: "accepted" | "rejected" | "sent" | "draft" | "cancelled"; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();
    const { quote } = await loadQuote(db, data.id);
    if (quote.status === data.outcome) throw new Error(`Quote is already ${data.outcome}`);
    if (quote.status === "accepted" && data.outcome !== "cancelled") {
      throw new Error("An accepted quote can only be cancelled");
    }

    const now = new Date().toISOString();
    const patch: Record<string, any> = { status: data.outcome };
    if (data.outcome === "accepted") patch.accepted_at = now;
    if (data.outcome === "rejected") patch.rejected_at = now;
    if (data.outcome === "sent") patch.sent_at = quote.sent_at ?? now;
    if (data.reason) patch.notes = `${quote.notes ? `${quote.notes}\n` : ""}${data.outcome}: ${data.reason}`;

    const { error } = await db.from("quotes").update(patch).eq("id", quote.id);
    if (error) throw new Error(error.message);

    // Mirror the decision into Quote Studio when connected.
    if (quote.studio_document_id) {
      const { quoteStudio, toStudioStatus } = await import("./quote-studio.server");
      if (data.outcome === "cancelled") {
        await quoteStudio.deleteDocument(quote.studio_document_id, actorOf(context));
      } else {
        await quoteStudio.setStatus(
          quote.studio_document_id,
          toStudioStatus(data.outcome),
          undefined,
          actorOf(context),
        );
      }
    }

    await record(db, context, quote, {
      event: `quote_${data.outcome}`,
      title: `Quote ${quote.quote_number ?? ""} ${data.outcome}`.trim(),
      description: data.reason ?? null,
      old: { status: quote.status },
      new: { status: data.outcome },
    });
    return patch;
  });

/**
 * Convert an accepted quote into a draft invoice, copying every line item.
 */
export const convertQuoteToInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; due_days?: number }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ["operations_manager", "finance", "sales"]);
    const db = await admin();
    const { quote, lines } = await loadQuote(db, data.id);
    if (!quote.customer_id) throw new Error("Attach the quote to a customer before invoicing");
    if (quote.status !== "accepted") throw new Error("Only accepted quotes can be converted to an invoice");
    if ((quote as any).invoice_id) {
      const { data: existing } = await db
        .from("invoices")
        .select("id, invoice_number")
        .eq("id", (quote as any).invoice_id)
        .maybeSingle();
      if (existing) {
        return {
          invoice_id: existing.id as string,
          invoice_number: existing.invoice_number as string,
          already: true,
        };
      }
    }


    const items = lines.length
      ? lines
      : [{ description: quote.title ?? "Quotation", quantity: 1, unit_price: Number(quote.amount ?? 0), tax_rate: 0, line_total: Number(quote.amount ?? 0) }];
    const subtotal = items.reduce((s: number, l: any) => s + Number(l.line_total ?? 0), 0);
    const tax = items.reduce((s: number, l: any) => s + (Number(l.line_total ?? 0) * Number(l.tax_rate ?? 0)) / 100, 0);
    const dueDays = data.due_days ?? 14;
    const issue = new Date();
    const due = new Date(issue.getTime() + dueDays * 86_400_000);

    const { data: inv, error } = await db
      .from("invoices")
      .insert({
        customer_id: quote.customer_id,
        account_number: quote.account_number,
        invoice_number: `INV-${Date.now().toString().slice(-8)}`,
        status: "draft",
        currency: quote.currency ?? "USD",
        subtotal,
        tax,
        total: subtotal + tax,
        issue_date: issue.toISOString().slice(0, 10),
        due_date: due.toISOString().slice(0, 10),
        notes: `Generated from quote ${quote.quote_number ?? quote.id}`,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await db.from("invoice_line_items").insert(
      items.map((l: any, i: number) => ({
        invoice_id: inv.id,
        description: l.description ?? "Item",
        quantity: Number(l.quantity ?? 1),
        unit_price: Number(l.unit_price ?? 0),
        tax_rate: Number(l.tax_rate ?? 0),
        position: l.position ?? i,
      })),
    );

    await db
      .from("quotes")
      .update({ invoice_id: inv.id, converted_at: new Date().toISOString() })
      .eq("id", quote.id);

    await record(db, context, quote, {
      event: "quote_converted",
      title: `Quote ${quote.quote_number ?? ""} converted to invoice ${inv.invoice_number}`.trim(),
      new: { invoice_id: inv.id, total: inv.total },
    });
    return {
      invoice_id: inv.id as string,
      invoice_number: inv.invoice_number as string,
      already: false,
    };
  });


/* ------------------------------------------------------------------ *
 * PDF proxy — the engine's PDF endpoint needs the API key, so the
 * browser cannot fetch it directly. We stream it through the server.
 * ------------------------------------------------------------------ */

export const getQuotePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { quote, lines } = await loadQuote(context.supabase, data.id);
    const { brandedQuotationPdf } = await import("./quotation-document.server");
    const rep = await salesRepOf(context.supabase, quote, context);
    let binary = "";
    const bytes = await brandedQuotationPdf(quote, lines, rep.name ?? undefined);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return {
      filename: `${quote.quote_number || quote.title || "quotation"}.pdf`.replace(/[^\w.-]+/g, "-"),
      base64: btoa(binary),
    };
  });

/* ------------------------------------------------------------------ *
 * Quotation builder — create / edit a full quotation with line items
 * ------------------------------------------------------------------ */

interface QuoteLineInput {
  description: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
}

interface SaveQuoteInput {
  id?: string;
  /** Empty for walk-in clients (no account on the platform). */
  customer_id?: string | null;
  walk_in?: { name: string; email?: string | null; phone?: string | null; address?: string | null } | null;
  quote_number?: string;
  title: string;
  currency?: string;
  valid_until?: string | null;
  notes?: string | null;
  discount?: number;
  lines: QuoteLineInput[];
  push?: boolean;
}


export const saveQuote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: SaveQuoteInput) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();

    const walkIn = data.walk_in && (data.walk_in.name ?? "").trim() ? data.walk_in : null;
    if (!data.customer_id && !walkIn) throw new Error("Select a customer, or enter walk-in client details");

    if (!data.title?.trim()) throw new Error("Quotation title is required");
    const lines = (data.lines ?? [])
      .filter((l) => (l.description ?? "").trim())
      .map((l, i) => {
        const qty = Number(l.quantity ?? 1) || 0;
        const price = Number(l.unit_price ?? 0) || 0;
        return {
          description: l.description.trim(),
          quantity: qty,
          unit_price: price,
          tax_rate: Number(l.tax_rate ?? 0) || 0,
          line_total: Number((qty * price).toFixed(2)),
          position: i,
        };
      });
    if (!lines.length) throw new Error("Add at least one line item");

    let cust: any = null;
    if (data.customer_id) {
      const { data: found, error: custErr } = await db
        .from("customers")
        .select("id,account_number,company_name")
        .eq("id", data.customer_id)
        .maybeSingle();
      if (custErr) throw new Error(custErr.message);
      if (!found) throw new Error("Customer not found");
      cust = found;
    }


    const { round2 } = await import("./quotation-document.shared");
    const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
    const tax = round2(lines.reduce((s, l) => s + (l.line_total * l.tax_rate) / 100, 0));
    const discount = Number(data.discount ?? 0) || 0;
    const total = round2(subtotal + tax - discount);


    let quoteNumber = (data.quote_number ?? "").trim() || null;
    if (!data.id && !quoteNumber) {
      const year = new Date().getFullYear();
      const { data: last } = await db
        .from("quotes")
        .select("quote_number")
        .like("quote_number", `QT-${year}-%`)
        .order("quote_number", { ascending: false })
        .limit(1);
      const seq = Number(String(last?.[0]?.quote_number ?? "").split("-").pop() ?? 0) + 1;
      quoteNumber = `QT-${year}-${String(seq).padStart(4, "0")}`;
    }

    const notes = discount
      ? `${data.notes ? `${data.notes}\n` : ""}Discount applied: ${discount.toFixed(2)}`
      : data.notes || null;

    const base = {
      customer_id: cust?.id ?? null,
      account_number: cust?.account_number ?? null,
      walkin_name: walkIn ? walkIn.name.trim() : null,
      walkin_email: walkIn ? walkIn.email || null : null,
      walkin_phone: walkIn ? walkIn.phone || null : null,
      walkin_address: walkIn ? walkIn.address || null : null,
      title: data.title.trim(),
      currency: (data.currency || "USD").toUpperCase(),
      amount: total,
      valid_until: data.valid_until || null,
      notes,
    };


    let quoteId = data.id ?? null;
    if (quoteId) {
      const { data: existing } = await db.from("quotes").select("status").eq("id", quoteId).maybeSingle();
      if (existing && !["draft", "sent"].includes(existing.status)) {
        throw new Error(`A ${existing.status} quotation can no longer be edited`);
      }
      const { error } = await db
        .from("quotes")
        .update({ ...base, ...(quoteNumber ? { quote_number: quoteNumber } : {}) })
        .eq("id", quoteId);
      if (error) throw new Error(error.message);
      const { data: prev } = await db.from("quote_line_items").select("item_code, position").eq("quote_id", quoteId).order("position");
      (prev ?? []).forEach((p: any, i: number) => { if (lines[i] && p.item_code) (lines[i] as any).item_code = p.item_code; });
      await db.from("quote_line_items").delete().eq("quote_id", quoteId);
    } else {
      const { data: created, error } = await db
        .from("quotes")
        .insert({ ...base, quote_number: quoteNumber, status: "draft", created_by: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      quoteId = created.id as string;
    }

    const { error: lineErr } = await db
      .from("quote_line_items")
      .insert(lines.map(({ line_total: _lt, ...l }) => ({ ...l, quote_id: quoteId })));
    if (lineErr) throw new Error(lineErr.message);

    const { quote } = await loadQuote(db, quoteId!);
    await record(db, context, quote, {
      event: data.id ? "quote_updated" : "quote_created",
      title: `Quote ${quote.quote_number ?? ""} ${data.id ? "updated" : "created"}`.trim(),
      description: `${lines.length} line item(s) · ${base.currency} ${total.toFixed(2)}`,
      new: { total, lines: lines.length },
      major: false,
    });

    // Best-effort document generation so a preview is instantly available.
    if (data.push !== false) {
      try {
        const { studioConfig, quoteStudio, buildDocumentPayload, pdfUrlOf, documentIdOf } =
          await import("./quote-studio.server");
        if (studioConfig().configured) {
          const { lines: fresh } = await loadQuote(db, quoteId!);
          const payload = buildDocumentPayload(quote, fresh, await salesRepOf(db, quote, context));
          const actor = actorOf(context);
          const res = quote.studio_document_id
            ? await quoteStudio.updateDocument(quote.studio_document_id, payload, actor)
            : await quoteStudio.createDocument(payload, actor);
          await db
            .from("quotes")
            .update(
              res.ok
                ? {
                    studio_document_id: documentIdOf(res.data) ?? quote.studio_document_id,
                    studio_pdf_url: pdfUrlOf(res.data) ?? quote.studio_pdf_url ?? null,
                    studio_status: "synced",
                    studio_error: null,
                    studio_synced_at: new Date().toISOString(),
                  }
                : { studio_status: "failed", studio_error: res.error, studio_synced_at: new Date().toISOString() },
            )
            .eq("id", quoteId);
        }
      } catch (e: any) {
        console.error("[saveQuote] document generation failed:", e?.message ?? e);
      }
    }

    return { id: quoteId as string, quote_number: quoteNumber, total, currency: base.currency };
  });

/**
 * Share payload for out-of-band channels (WhatsApp, SMS, copy-link).
 * Returns the recipient details plus a prepared message; the caller opens the
 * channel. The share is recorded on the customer timeline.
 */
export const shareQuoteExternally = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; channel: "whatsapp" | "sms" | "link"; phone?: string; message?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, QUOTE_ROLES);
    const db = await admin();
    const { quote } = await loadQuote(db, data.id);

    const phone = String(data.phone || quote.customers?.primary_phone || quote.walkin_phone || "").replace(/[^\d]/g, "");
    if (data.channel !== "link" && !phone) throw new Error("No phone number on file — enter one to share");

    const rep = await salesRepOf(db, quote, context);
    const money = `${quote.currency ?? "USD"} ${Number(quote.amount ?? 0).toFixed(2)}`;
    const message =
      data.message?.trim() ||
      [
        `Good day ${quote.customers?.company_name ?? quote.walkin_name ?? ""}`.trim() + ",",
        "",
        `Please find our quotation ${quote.quote_number ?? ""} — ${quote.title} (${money}).`,
        quote.valid_until ? `Valid until ${new Date(quote.valid_until).toLocaleDateString()}.` : "",
        quote.studio_pdf_url ? `Document: ${quote.studio_pdf_url}` : "",
        "",
        `Regards,\n${rep.name ?? "IMT Solutions"}\nIMT Solutions`,
      ]
        .filter(Boolean)
        .join("\n");

    const now = new Date().toISOString();
    if (quote.status === "draft") {
      await db.from("quotes").update({ status: "sent", sent_at: now }).eq("id", quote.id);
    }

    await record(db, context, quote, {
      event: "quote_shared",
      title: `Quote ${quote.quote_number ?? ""} shared via ${data.channel}`.trim(),
      description: data.channel === "link" ? "Document link copied" : `Sent to ${phone}`,
      new: { channel: data.channel, phone: phone || null },
    });

    return { phone, message, pdf_url: quote.studio_pdf_url as string | null };
  });
