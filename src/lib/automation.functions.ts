/**
 * Automation console server functions (Block 9).
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getAutomationConsole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaff } = await import("./customer360.server");
    await assertStaff(context as any);
    const { admin, loadConfig, RULES } = await import("./automation.server");
    const db = await admin();
    const [config, runs] = await Promise.all([
      loadConfig(db),
      db.from("automation_runs").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
    const byRule: Record<string, any> = {};
    for (const r of (runs.data ?? []) as any[]) if (!byRule[r.rule]) byRule[r.rule] = r;
    return {
      rules: RULES.map((r) => ({ ...r, config: config[r.key], last_run: byRule[r.key] ?? null })),
      runs: (runs.data ?? []) as any[],
    };
  });

export const updateAutomationRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rule: string; config: Record<string, any> }) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, isFinanceOrAdmin } = await import("./customer360.server");
    await assertStaff(context as any);
    const allowed = await isFinanceOrAdmin(context as any);
    const { admin, loadConfig, saveConfig, RULES } = await import("./automation.server");
    if (!allowed) throw new Error("Only master admins and finance can change automation rules");
    if (!RULES.some((r) => r.key === data.rule)) throw new Error("Unknown automation rule");
    const db = await admin();
    const config = await loadConfig(db);
    config[data.rule] = { ...config[data.rule], ...data.config } as any;
    await saveConfig(db, config, context.userId);
    await db.from("audit_log").insert({
      actor_id: context.userId,
      action: "automation_rule_updated",
      entity_type: "system_settings",
      entity_id: null,
      module: "automation",
      new_value: { rule: data.rule, config: config[data.rule] },
    });
    return config[data.rule];
  });

export const runAutomationNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rule?: string }) => d)
  .handler(async ({ data, context }) => {
    const { assertStaff, isFinanceOrAdmin } = await import("./customer360.server");
    await assertStaff(context as any);
    if (!(await isFinanceOrAdmin(context as any))) {
      throw new Error("Only master admins and finance can trigger automation manually");
    }
    const { runAutomation } = await import("./automation.server");
    return runAutomation({
      rules: data.rule ? ([data.rule] as any) : undefined,
      trigger: "manual",
      userId: context.userId,
      force: Boolean(data.rule),
    });
  });
