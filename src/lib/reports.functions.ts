/**
 * Reporting server functions (Block 9).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { REPORTS } = await import("./reports.server");
    return REPORTS.map((r) => ({ ...r }));
  });

export const runReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; from?: string; to?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const db = await admin();
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    const { buildReport } = await import("./reports.server");
    return buildReport(db, data.key, from, to);
  });

export const emailReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { key: string; from?: string; to?: string; email: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    if (!/@/.test(data.email)) throw new Error("Enter a valid recipient email address");
    const db = await admin();
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
    const { buildReport } = await import("./reports.server");
    const report = await buildReport(db, data.key, from, to);
    const metrics = report.chips.map((c) => ({ label: c.label, value: c.value }));
    const { notify } = await import("./notify.server");
    await notify("ops-digest", data.email, {
      period: `${from} → ${to}`,
      cadence: report.title,
      metrics,
      generatedAt: report.generated_at,
    }, `report-${report.key}-${from}-${to}-${data.email}`);
    return { sent_to: data.email, metrics };
  });
