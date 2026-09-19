/**
 * POST /api/public/portal/payment-status
 *
 * The portal pushes gateway status changes here (e.g. a payment that later
 * failed or was reversed). A submission billing has already approved is never
 * silently changed — it is flagged for clarification instead, so the ledger and
 * the approval trail stay truthful.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, json, normaliseExternalStatus, notifyBilling, publicSubmission, requireApiKey,
} from "@/lib/portal-api.server";

export const Route = createFileRoute("/api/public/portal/payment-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        let body: { external_id?: string; status?: string; reason?: string; metadata?: Record<string, unknown> };
        try { body = await request.json(); }
        catch { return fail(400, "Request body must be JSON"); }

        const externalId = String(body.external_id ?? "").trim();
        if (!externalId) return fail(400, "external_id is required");
        const gatewayStatus = normaliseExternalStatus(body.status);

        const sb = await db();
        const { data: sub } = await sb.from("payment_submissions")
          .select("*").eq("source", "portal").eq("external_id", externalId).maybeSingle();
        if (!sub) return fail(404, "No portal payment with that external_id");

        const patch: Record<string, any> = { external_status: gatewayStatus };
        if (body.metadata) patch.external_payload = body.metadata;
        let note = `Portal reported status "${gatewayStatus}"`;
        if (body.reason?.trim()) note += ` · ${body.reason.trim()}`;

        if (["failed", "cancelled"].includes(gatewayStatus)) {
          if (sub.status === "pending" || sub.status === "clarification") {
            patch.status = "cancelled";
            patch.rejection_reason = note;
          } else if (sub.status === "approved") {
            // Money is already on the ledger — billing must reverse it deliberately.
            await notifyBilling(
              sb,
              "Portal payment reversed after approval",
              `${sub.currency} ${Number(sub.amount).toFixed(2)} on ${sub.account_number} was reported "${gatewayStatus}" by the portal after it was recorded. A refund or reversal is needed.`,
            );
          }
        }

        const { data: row, error } = await sb.from("payment_submissions")
          .update(patch).eq("id", sub.id).select("*").single();
        if (error) return fail(500, error.message);

        await sb.from("payment_submission_events").insert({
          submission_id: sub.id, action: patch.status === "cancelled" ? "cancelled" : "status_updated", notes: note,
        } as any);

        return json({ ok: true, payment: publicSubmission(row) });
      },
    },
  },
});
