/**
 * Webhook: support tickets from the Base44 client app.
 *
 * POST /api/public/hooks/base44-tickets
 * Auth: `x-api-key: <BASE44_API_KEY>` or `Authorization: Bearer <BASE44_API_KEY>`.
 * Body (JSON): { external_id?, account_number? | customer_email?, subject, description?,
 *   priority?, category?, requester_name?, requester_email? }
 * Replaying the same external_id returns the original ticket (idempotent).
 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { db, fail, json } from "@/lib/portal-api.server";

function requireBase44Key(request: Request): Response | null {
  const expected = process.env["BASE44_API_KEY"];
  if (!expected) return fail(503, "Base44 key not configured");
  const got = (request.headers.get("x-api-key") ?? (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")).trim();
  const a = new TextEncoder().encode(got), b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return fail(401, "Invalid or missing API key");
  let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0 ? null : fail(401, "Invalid or missing API key");
}
import { slaDueFrom } from "@/lib/support.server";

const Schema = z.object({
  external_id: z.string().trim().max(200).optional(),
  account_number: z.string().trim().max(40).optional(),
  customer_id: z.string().uuid().optional(),
  customer_email: z.string().trim().email().max(255).optional(),
  subject: z.string().trim().min(1).max(300),
  description: z.string().trim().max(10000).optional(),
  priority: z.string().trim().max(20).optional(),
  category: z.string().trim().max(80).optional(),
  requester_name: z.string().trim().max(200).optional(),
  requester_email: z.string().trim().email().max(255).optional(),
});

export const Route = createFileRoute("/api/public/hooks/base44-tickets")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireBase44Key(request);
        if (denied) return denied;

        let raw: unknown;
        try { raw = await request.json(); } catch { return fail(400, "Body must be JSON"); }
        const parsed = Schema.safeParse(raw);
        if (!parsed.success) return fail(400, "Invalid payload", { issues: parsed.error.flatten().fieldErrors });
        const b = parsed.data;

        const sb: any = await db();
        // Client ownership is configured by this platform, never by inbound identifiers.
        const { data: setting, error: settingError } = await sb.from("system_settings")
          .select("value").eq("key", "base44_ticket_customer_id").maybeSingle();
        if (settingError) return fail(500, settingError.message);
        if (typeof setting?.value !== "string") return fail(503, "Base44 client account is not configured");
        const { data: customer, error: customerError } = await sb.from("customers")
          .select("id,account_number,company_name,status").eq("id", setting.value).maybeSingle();
        if (customerError) return fail(500, customerError.message);
        if (!customer) return fail(503, "Base44 client account is unavailable");

        const marker = b.external_id ? `[base44:${b.external_id}]` : null;
        if (marker) {
          const { data: existing } = await sb.from("tickets").select("id,ticket_number,status,priority,subject,created_at")
            .eq("customer_id", customer.id).ilike("description", `%${marker}%`).limit(1).maybeSingle();
          if (existing) return json({ ok: true, duplicate: true, ticket: existing });
        }

        const p = String(b.priority ?? "normal").toLowerCase();
        const priority = ["low", "normal", "high", "critical"].includes(p) ? p : p === "urgent" ? "critical" : "normal";
        const requesterEmail = b.requester_email || b.customer_email;
        const who = b.requester_name || requesterEmail ? `\n\nRequested by: ${[b.requester_name, requesterEmail].filter(Boolean).join(" · ")}` : "";
        const description = `${b.description ?? ""}${who}${marker ? `\n\n${marker}` : ""}`.trim() || null;

        const { data: ticket, error } = await sb.from("tickets").insert({
          customer_id: customer.id,
          account_number: customer.account_number,
          subject: b.subject,
          description,
          priority,
          category: b.category || "general",
          status: "open",
          sla_due_at: slaDueFrom(priority),
        }).select("id,ticket_number,status,priority,subject,sla_due_at,created_at").single();
        if (error) return fail(500, error.message);

        const { data: staff } = await sb.from("user_roles").select("user_id")
          .in("role", ["technical_support", "noc", "operations_manager", "master_admin"]);
        const ids = Array.from(new Set((staff ?? []).map((r: any) => r.user_id)));
        if (ids.length) {
          await sb.from("notifications").insert(ids.map((id) => ({
            user_id: id,
            kind: "portal_ticket",
            title: `New Base44 ticket: ${b.subject}`,
            body: `${customer.company_name} (${customer.account_number}) · ${priority}`,
            link: `/tickets/${ticket.id}`,
          })));
        }

        return json({ ok: true, ticket }, 201);
      },
    },
  },
});
