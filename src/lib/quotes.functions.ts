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
    return { quote, lines, studio: { configured: studioConfig().configured } };
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

    const to = (data.email || quote.customers?.primary_email || "").trim();
    if (!/@/.test(to)) throw new Error("No customer email on file — enter a recipient address");

    // Make sure a fresh document exists before we email the link.
    const { quoteStudio, buildDocumentPayload, pdfUrlOf, documentIdOf, studioConfig } =
      await import("./quote-studio.server");
    let pdfUrl: string | null = quote.studio_pdf_url ?? null;
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
        }
      } else {
        studioError = res.error;
      }
    }

    const items = (lines ?? []).map((l: any) => ({
      description: l.description,
      quantity: Number(l.quantity ?? 1),
      unit_price: Number(l.unit_price ?? 0),
      line_total: Number(l.line_total ?? 0),
    }));
    const subtotal = items.length
      ? items.reduce((s: number, l: any) => s + l.line_total, 0)
      : Number(quote.amount ?? 0);

    const { notify } = await import("./notify.server");
    await notify(
      "quote",
      to,
      {
        companyName: quote.customers?.company_name ?? quote.account_number ?? "there",
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
      description: pdfUrl ? "Quotation email delivered with document link" : "Quotation email delivered",
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
        line_total: Number(l.line_total ?? 0),
        position: l.position ?? i,
      })),
    );

    await record(db, context, quote, {
      event: "quote_converted",
      title: `Quote ${quote.quote_number ?? ""} converted to invoice ${inv.invoice_number}`.trim(),
      new: { invoice_id: inv.id, total: inv.total },
    });
    return { invoice_id: inv.id as string, invoice_number: inv.invoice_number as string };
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
    const { quoteStudio, buildDocumentPayload } = await import("./quote-studio.server");
    const actor = actorOf(context);

    // Prefer the stored document; fall back to a stateless render.
    const res = quote.studio_document_id
      ? await quoteStudio.documentPdf(quote.studio_document_id, actor)
      : await quoteStudio.renderPdf(
          buildDocumentPayload(quote, lines, await salesRepOf(context.supabase, quote, context)),
          actor,
        );
    if (!res.ok) throw new Error(res.error);

    let binary = "";
    const bytes = res.data.bytes;
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return {
      filename: `${quote.quote_number || quote.title || "quotation"}.pdf`.replace(/[^\w.-]+/g, "-"),
      base64: btoa(binary),
    };
  });
