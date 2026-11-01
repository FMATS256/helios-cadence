import { denyUnlessInternal } from "@/lib/hook-auth.server";
// Cron hook: computes each customer's monthly spend and fires notifications
// when a budget threshold (warning) or cap (breach) is crossed.
// Schedule via pg_cron hourly.
import { createFileRoute } from "@tanstack/react-router";

function monthStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

export const Route = createFileRoute("/api/public/hooks/budget-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => { const denied = denyUnlessInternal(request); if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [{ data: budgets }, { data: servers }, { data: subs }] = await Promise.all([
          supabaseAdmin.from("customer_budgets").select("*").eq("enabled", true),
          supabaseAdmin.from("cloud_servers").select("customer_id, monthly_cost_usd, selling_price_usd").is("archived_at", null),
          supabaseAdmin.from("subscriptions").select("customer_id, amount, status"),
        ]);

        const spend: Record<string, number> = {};
        for (const s of servers ?? []) {
          if (!s.customer_id) continue;
          spend[s.customer_id] = (spend[s.customer_id] ?? 0) + Number(s.selling_price_usd || s.monthly_cost_usd || 0);
        }
        for (const s of subs ?? []) {
          if (!s.customer_id || s.status !== "active") continue;
          spend[s.customer_id] = (spend[s.customer_id] ?? 0) + Number(s.amount || 0);
        }

        const month = monthStart();
        let sent = 0;

        for (const b of budgets ?? []) {
          const used = spend[b.customer_id] ?? 0;
          const cap = Number(b.monthly_cap_usd || 0);
          if (cap <= 0) continue;
          const pct = (used / cap) * 100;

          let level: "warning" | "breach" | null = null;
          if (pct >= 100) level = "breach";
          else if (pct >= Number(b.alert_threshold_pct || 80)) level = "warning";
          if (!level) continue;

          // Idempotent: unique (customer_id, month, level)
          const { data: inserted } = await supabaseAdmin.from("budget_alerts").upsert({
            customer_id: b.customer_id, month, level,
            spend_usd: used, cap_usd: cap, pct: Number(pct.toFixed(2)),
          }, { onConflict: "customer_id,month,level", ignoreDuplicates: true }).select("id");

          if (inserted?.length && b.notify_user_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: b.notify_user_id,
              kind: level === "breach" ? "budget_breach" : "budget_warning",
              title: level === "breach"
                ? `Budget exceeded ($${used.toFixed(2)} / $${cap.toFixed(2)})`
                : `Budget at ${pct.toFixed(0)}% ($${used.toFixed(2)} / $${cap.toFixed(2)})`,
              body: `Customer budget threshold crossed for ${month}.`,
              link: "/cloud-ops",
            });
            sent++;
          }
        }

        return Response.json({ checked: budgets?.length ?? 0, sent });
      },
    },
  },
});
