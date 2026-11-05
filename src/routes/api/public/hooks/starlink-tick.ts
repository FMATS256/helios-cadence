import { denyUnlessInternal } from "@/lib/hook-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Block 6 — Starlink recharge supplier follow-up.
// Re-checks recharges sitting in "awaiting_supplier" once their next_check_at
// (≈1 hour after the WhatsApp request) has passed. Each pass notifies staff to
// confirm; after MAX_SUPPLIER_CHECKS passes without a supplier reply the
// recharge is marked failed and everyone is notified.
async function runStarlinkTick(request: Request) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const {
    SUPPLIER_RECHECK_MINUTES, MAX_SUPPLIER_CHECKS, recordRechargeEvent, notifyStarlinkStaff,
  } = await import("@/lib/starlink-workflow.server");
  const { recordCustomerEvent, metaFromRequest } = await import("@/lib/customer-events.server");
  const meta = metaFromRequest(request);

  const now = new Date();
  const { data: due, error } = await (supabaseAdmin.from("starlink_recharges") as any)
    .select("*")
    .eq("workflow_status", "awaiting_supplier")
    .not("next_check_at", "is", null)
    .lte("next_check_at", now.toISOString())
    .limit(100);
  if (error) return { ok: false, error: error.message };

  let rechecked = 0;
  let failed = 0;

  for (const r of (due ?? []) as any[]) {
    const attempts = Number(r.check_attempts ?? 0) + 1;
    const reference = r.payment_reference ?? r.id;

    if (r.supplier_reply) {
      // A reply was captured out of band — close the loop as completed.
      await (supabaseAdmin.from("starlink_recharges") as any)
        .update({
          workflow_status: "completed", status: "completed", external_status: "confirmed",
          completed_at: now.toISOString(), supplier_checked_at: now.toISOString(), next_check_at: null,
          check_attempts: attempts,
        })
        .eq("id", r.id);
      await recordRechargeEvent(supabaseAdmin, {
        recharge_id: r.id, from_status: "awaiting_supplier", to_status: "completed",
        note: "Supplier reply captured — auto-completed by follow-up job.",
      });
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: r.customer_id, account_number: r.account_number,
        event_type: "starlink_recharge_completed", title: "Starlink recharge completed",
        description: `${reference} · supplier confirmed`, module: "starlink",
        entity_type: "starlink_recharge", entity_id: r.id, major: true,
      }, meta);
      await notifyStarlinkStaff(supabaseAdmin, "Starlink recharge completed", `${r.account_number} · ${reference}`);
      rechecked++;
      continue;
    }

    if (attempts >= MAX_SUPPLIER_CHECKS) {
      await (supabaseAdmin.from("starlink_recharges") as any)
        .update({
          workflow_status: "failed", status: "failed", external_status: "failed",
          failure_reason: `No supplier confirmation after ${attempts} follow-ups.`,
          supplier_checked_at: now.toISOString(), next_check_at: null, check_attempts: attempts,
        })
        .eq("id", r.id);
      await recordRechargeEvent(supabaseAdmin, {
        recharge_id: r.id, from_status: "awaiting_supplier", to_status: "failed",
        note: `No supplier confirmation after ${attempts} follow-ups.`,
      });
      await recordCustomerEvent(supabaseAdmin, {
        customer_id: r.customer_id, account_number: r.account_number,
        event_type: "starlink_recharge_failed", title: "Starlink recharge failed",
        description: `${reference} · no supplier confirmation after ${attempts} follow-ups`,
        module: "starlink", entity_type: "starlink_recharge", entity_id: r.id, major: true,
      }, meta);
      await notifyStarlinkStaff(
        supabaseAdmin, "Starlink recharge needs attention",
        `${r.account_number} · ${reference} · supplier never confirmed after ${attempts} follow-ups.`,
      );
      failed++;
      continue;
    }

    await (supabaseAdmin.from("starlink_recharges") as any)
      .update({
        check_attempts: attempts,
        supplier_checked_at: now.toISOString(),
        next_check_at: new Date(now.getTime() + SUPPLIER_RECHECK_MINUTES * 60_000).toISOString(),
      })
      .eq("id", r.id);
    await recordRechargeEvent(supabaseAdmin, {
      recharge_id: r.id, from_status: "awaiting_supplier", to_status: "awaiting_supplier",
      note: `Follow-up ${attempts}/${MAX_SUPPLIER_CHECKS} — still awaiting supplier reply.`,
    });
    await notifyStarlinkStaff(
      supabaseAdmin, "Starlink recharge still awaiting supplier",
      `${r.account_number} · ${reference} · follow-up ${attempts}/${MAX_SUPPLIER_CHECKS}.`,
    );
    rechecked++;
  }

  return { ok: true, due: due?.length ?? 0, rechecked, failed };
}

export const Route = createFileRoute("/api/public/hooks/starlink-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => denyUnlessInternal(request) ?? new Response(JSON.stringify(await runStarlinkTick(request)), { headers: { "content-type": "application/json" } }),
      POST: async ({ request }) => denyUnlessInternal(request) ?? new Response(JSON.stringify(await runStarlinkTick(request)), { headers: { "content-type": "application/json" } }),
    },
  },
});
