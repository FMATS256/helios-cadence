/**
 * GET /api/public/portal/payments/:external_id
 * Single portal payment with its verification status and receipt number.
 */
import { createFileRoute } from "@tanstack/react-router";
import { db, fail, json, publicSubmission, requireApiKey } from "@/lib/portal-api.server";

export const Route = createFileRoute("/api/public/portal/payments/$externalId")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const sb = await db();
        const { data, error } = await sb.from("payment_submissions")
          .select("*")
          .or(`external_id.eq.${params.externalId},id.eq.${params.externalId}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) return fail(500, error.message);
        if (!data) return fail(404, "Payment not found");

        let receipt: any = null;
        if (data.payment_id) {
          const { data: pay } = await sb.from("payments")
            .select("id,receipt_number,amount,currency,paid_at,status")
            .eq("id", data.payment_id).maybeSingle();
          receipt = pay ?? null;
        }
        return json({ ok: true, payment: publicSubmission(data), recorded_payment: receipt });
      },
    },
  },
});
