import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ASSISTANT_ROLES, allowedAssistantRoles } from "./personal-assistant.shared";

export const getPersonalAssistant = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [s, t, a] = await Promise.all([
      context.supabase.from("personal_assistant_settings").select("*").eq("user_id", context.userId).maybeSingle(),
      context.supabase.from("personal_assistant_tasks").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(30),
      context.supabase.from("personal_assistant_actions").select("id,kind,title,payload,status,result,error,created_at").eq("user_id", context.userId).order("created_at", { ascending: false }).limit(40),
    ]);
    return {
      settings: s.data ?? { assistant_name: "Personal Assistant", persona: "", enabled_roles: Object.keys(ASSISTANT_ROLES), report_email: null, daily_report_enabled: false },
      tasks: t.data ?? [],
      actions: a.data ?? [],
    };
  });

export const savePersonalAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assistant_name: string; persona: string; enabled_roles: string[]; report_email?: string | null; daily_report_enabled?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("personal_assistant_settings").upsert({
      user_id: context.userId,
      assistant_name: data.assistant_name.trim().slice(0, 80) || "Personal Assistant",
      persona: data.persona.slice(0, 2000),
      enabled_roles: data.enabled_roles.filter((r) => r in ASSISTANT_ROLES),
      report_email: data.report_email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.report_email) ? data.report_email.trim().toLowerCase() : null,
      daily_report_enabled: !!data.daily_report_enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignPersonalAssistantTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; instructions: string; role: string }) => d)
  .handler(async ({ data, context }) => {
    if (!data.title.trim()) throw new Error("Give the task a title");
    const { data: s } = await context.supabase.from("personal_assistant_settings").select("*").eq("user_id", context.userId).maybeSingle();
    const settings = s ?? { assistant_name: "Personal Assistant", persona: "", enabled_roles: Object.keys(ASSISTANT_ROLES) };
    const roles = allowedAssistantRoles(settings.enabled_roles, data.role);
    if (!roles.length) throw new Error("That duty is switched off for your assistant");
    const { data: task, error } = await context.supabase.from("personal_assistant_tasks").insert({
      user_id: context.userId, title: data.title.trim().slice(0, 200), instructions: data.instructions.slice(0, 4000), role: data.role,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { runPersonalAssistant } = await import("./personal-assistant.server");
    try {
      const summary = await runPersonalAssistant(context.supabase, context.userId, settings, roles, `${data.title}\n${data.instructions}`, task.id);
      await context.supabase.from("personal_assistant_tasks").update({ status: "done", summary, finished_at: new Date().toISOString() }).eq("id", task.id);
      return { id: task.id, summary };
    } catch (e: any) {
      const msg = e?.statusCode === 402 ? "AI credits are used up. Top up in Settings → Plans & credits." : (e?.message ?? "Assistant failed");
      await context.supabase.from("personal_assistant_tasks").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", task.id);
      throw new Error(msg);
    }
  });

export const decideAssistantAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; approve: boolean }) => d)
  .handler(async ({ data, context }) => {
    if (!data.approve) {
      const { error } = await context.supabase.from("personal_assistant_actions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", data.id).eq("status", "pending");
      if (error) throw new Error(error.message);
      return { ok: true, result: "Rejected" };
    }
    const { executeAssistantAction } = await import("./personal-assistant-actions.server");
    const r = await executeAssistantAction({ id: data.id, userId: context.userId });
    if (!r.ok) throw new Error(r.error);
    return { ok: true, result: r.result };
  });

export const sendAssistantReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: s } = await context.supabase.from("personal_assistant_settings").select("report_email").eq("user_id", context.userId).maybeSingle();
    if (!s?.report_email) throw new Error("Save a report email first");
    const { sendDailyReport } = await import("./personal-assistant-actions.server");
    const r = await sendDailyReport(context.userId, s.report_email, true);
    return { sent: !!r.sent };
  });
