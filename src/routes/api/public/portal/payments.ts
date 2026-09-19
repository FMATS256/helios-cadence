/**
 * IMT Payments Portal → operations platform.
 *
 * POST /api/public/portal/payments   record a portal payment for verification
 * GET  /api/public/portal/payments   look up payment status(es)
 *
 * Auth: header `x-api-key: <PORTAL_API_KEY>` (or `Authorization: Bearer ...`).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, findCustomer, json, normaliseExternalStatus, notifyBilling,
  num, openInvoices, publicSubmission, requireApiKey, round,
} from "@/lib/portal-api.server";

type Body = {
  external_id: string;
  account_number?: string;
  customer_id?: string;
  amount: number;
  currency?: string;
  method?: string;
  reference?: string;
  payment_date?: string;
  invoice_number?: string;
  invoice_id?: string;
  status?: string;
  payer_name?: string;
  gateway?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export const Route = createFileRoute("/api/public/portal/payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return fail(400, "Request body must be JSON"); }

        const externalId = String(body.external_id ?? "").trim();
        if (!externalId) return fail(400, "external_id is required so payments are not duplicated");

        const amount = round(num(body.amount));
        if (!(amount > 0)) return fail(400, "amount must be greater than zero");

        const sb = await db();

        // Idempotency: same portal transaction replayed → return what we have.
        const { data: existing } = await sb.from("payment_submissions")
          .select("*").eq("source", "portal").eq("external_id", externalId).maybeSingle();
        if (existing) return json({ ok: true, duplicate: true, payment: publicSubmission(existing) });

        const customer = await findCustomer(sb, body.account_number, body.customer_id);
        if (!customer) return fail(404, "Customer not found for that account number");

        const gatewayStatus = normaliseExternalStatus(body.status);
        if (gatewayStatus !== "succeeded") {
          // Nothing to verify until the money actually cleared.
          return json({
            ok: true,
            accepted: false,
            reason: `Payment is "${gatewayStatus}" — send it again once the gateway reports success`,
            gateway_status: gatewayStatus,
          });
        }

        // Optional invoice targeting, by id or by invoice number.
        let invoiceId: string | null = null;
        if (body.invoice_id || body.invoice_number) {
          let q = sb.from("invoices").select("id,customer_id,invoice_number").eq("customer_id", customer.id);
          q = body.invoice_id ? q.eq("id", body.invoice_id) : q.ilike("invoice_number", String(body.invoice_number).trim());
          const { data: inv } = await q.maybeSingle();
          if (!inv) return fail(404, "That invoice was not found on this customer account");
          invoiceId = inv.id;
        }

        // Bank the money into the mobile money / default account when known.
        const { data: accounts } = await sb.from("cash_accounts")
          .select("id,name,kind,is_default,is_active").eq("is_active", true);
        const method = String(body.method ?? "mobile_money").trim().toLowerCase();
        const pick = (accounts ?? []).find((a: any) =>
          method.includes("mobile") || method.includes("ecocash") ? a.kind === "mobile_money" : false,
        ) ?? (accounts ?? []).find((a: any) => a.is_default) ?? (accounts ?? [])[0] ?? null;

        const reference = String(body.reference ?? externalId).trim();
        const noteParts = [
          `Received via IMT Payments Portal${body.gateway ? ` (${body.gateway})` : ""}`,
          body.payer_name ? `Payer: ${body.payer_name}` : null,
          body.notes?.trim() || null,
        ].filter(Boolean);

        const { data: row, error } = await sb.from("payment_submissions").insert({
          customer_id: customer.id,
          account_number: customer.account_number,
          invoice_id: invoiceId,
          amount,
          currency: (body.currency || "USD").toUpperCase(),
          method: body.method || "mobile_money",
          payment_date: (body.payment_date || new Date().toISOString()).slice(0, 10),
          reference,
          cash_account_id: pick?.id ?? null,
          notes: noteParts.join(" · "),
          status: "pending",
          source: "portal",
          external_id: externalId,
          external_status: gatewayStatus,
          external_payload: (body.metadata ?? null) as any,
        } as any).select("*").single();
        if (error) return fail(500, error.message);

        await sb.from("payment_submission_events").insert({
          submission_id: row.id, action: "submitted",
          notes: `Portal payment ${externalId} received for verification`,
        } as any);

        await notifyBilling(
          sb,
          "Portal payment awaiting verification",
          `${row.currency} ${amount.toFixed(2)} received from ${customer.company_name} (${customer.account_number}) via the payments portal.`,
        );

        try {
          const { recordCustomerEvent } = await import("@/lib/customer-events.server");
          await recordCustomerEvent(sb, {
            customer_id: customer.id, account_number: customer.account_number,
            event_type: "payment_submitted",
            title: `Portal payment received: ${row.currency} ${amount.toFixed(2)}`,
            description: `Reference ${reference} · awaiting billing verification`,
            module: "billing", entity_type: "payment_submission", entity_id: row.id,
            new_value: { amount, method: row.method, external_id: externalId },
          });
        } catch { /* timeline entry is best-effort */ }

        return json({
          ok: true,
          accepted: true,
          payment: publicSubmission(row),
          balance: { open_invoices: await openInvoices(sb, customer.id) },
        }, 201);
      },

      GET: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const externalId = url.searchParams.get("external_id");
        const reference = url.searchParams.get("reference");
        const accountNumber = url.searchParams.get("account_number");
        const status = url.searchParams.get("status");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);

        if (!externalId && !reference && !accountNumber) {
          return fail(400, "Provide external_id, reference or account_number");
        }

        const sb = await db();
        let q = sb.from("payment_submissions").select("*")
          .order("created_at", { ascending: false }).limit(limit);
        if (externalId) q = q.eq("external_id", externalId);
        if (reference) q = q.eq("reference", reference);
        if (accountNumber) q = q.ilike("account_number", accountNumber.trim());
        if (status) q = q.eq("status", status);

        const { data, error } = await q;
        if (error) return fail(500, error.message);
        return json({ ok: true, count: data?.length ?? 0, payments: (data ?? []).map(publicSubmission) });
      },
    },
  },
});
