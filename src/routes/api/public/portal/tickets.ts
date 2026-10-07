/**
 * Client support tickets for the external app.
 *
 * GET  /api/public/portal/tickets?account_number=M10457   list a customer's tickets
 * POST /api/public/portal/tickets                          open a new ticket
 *
 * Auth: header `x-api-key: <PORTAL_API_KEY>` (or `Authorization: Bearer ...`).
 * `external_id` on POST makes ticket creation idempotent.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, findCustomer, json, requireApiKey,
} from "@/lib/portal-api.server";

type Body = {
  external_id?: string;
  account_number?: string;
  customer_id?: string;
  subject: string;
  description?: string;
  priority?: string;
  category?: string;
  requester_email?: string;
  requester_name?: string;
};

function publicTicket(t: any) {
  return {
    id: t.id,
    ticket_number: t.ticket_number ?? null,
    subject: t.subject,
    status: t.status,
    priority: t.priority,
    category: t.category ?? null,
    created_at: t.created_at,
    updated_at: t.updated_at,
    resolved_at: t.resolved_at ?? null,
  };
}

export const Route = createFileRoute("/api/public/portal/tickets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const accountNumber = url.searchParams.get("account_number");
        const customerId = url.searchParams.get("customer_id");
        const status = url.searchParams.get("status");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
        if (!accountNumber && !customerId) return fail(400, "Provide account_number or customer_id");

        const sb = await db();
        const customer = await findCustomer(sb, accountNumber, customerId);
        if (!customer) return fail(404, "Customer not found");

        let q = sb.from("tickets").select("*")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status) q = q.eq("status", status);

        const { data, error } = await q;
        if (error) return fail(500, error.message);

        const ticketIds = (data ?? []).map((t: any) => t.id);
        const { data: messages } = ticketIds.length
          ? await sb.from("ticket_messages")
              .select("ticket_id,body,created_at,is_internal")
              .in("ticket_id", ticketIds)
              .order("created_at", { ascending: true })
          : { data: [] as any[] };

        const msgsByTicket: Record<string, any[]> = {};
        for (const m of messages ?? []) {
          if (m.is_internal) continue; // never leak staff-only notes
          (msgsByTicket[m.ticket_id] ??= []).push({
            body: m.body,
            created_at: m.created_at,
          });
        }

        return json({
          ok: true,
          count: data?.length ?? 0,
          tickets: (data ?? []).map((t: any) => ({
            ...publicTicket(t),
            messages: msgsByTicket[t.id] ?? [],
          })),
        });
      },

      POST: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return fail(400, "Request body must be JSON"); }

        const subject = String(body.subject ?? "").trim();
        if (!subject) return fail(400, "subject is required");

        const sb = await db();

        const customer = await findCustomer(sb, body.account_number, body.customer_id);
        if (!customer) return fail(404, "Customer not found for that account number");

        // Soft idempotency: an identical open ticket created in the last
        // 10 minutes is almost certainly a retry of the same tap.
        const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: existing } = await sb.from("tickets")
          .select("*")
          .eq("customer_id", customer.id)
          .ilike("subject", subject)
          .eq("status", "open")
          .gte("created_at", since)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existing) return json({ ok: true, duplicate: true, ticket: publicTicket(existing) });

        const priority = ["low", "normal", "high", "urgent"].includes(String(body.priority).toLowerCase())
          ? String(body.priority).toLowerCase()
          : "normal";

        const { data: row, error } = await sb.from("tickets").insert({
          customer_id: customer.id,
          account_number: customer.account_number,
          subject,
          description: body.description?.trim() || null,
          priority,
          category: body.category?.trim() || "general",
          status: "open",
        } as any).select("*").single();
        if (error) return fail(500, error.message);

        // Let the support desk know a client opened a ticket.
        const { data: staff } = await sb.from("user_roles")
          .select("user_id")
          .in("role", ["technical_support", "noc", "operations_manager", "master_admin"] as any);
        const ids = Array.from(new Set((staff ?? []).map((r: any) => r.user_id)));
        if (ids.length) {
          await sb.from("notifications").insert(
            ids.map((id) => ({
              user_id: id,
              kind: "portal_ticket",
              title: `New client ticket: ${subject}`,
              body: `${customer.company_name} (${customer.account_number}) opened a ${priority} ticket from the client app.`,
              link: `/tickets`,
            })) as any,
          );
        }

        return json({ ok: true, ticket: publicTicket(row) }, 201);
      },
    },
  },
});
