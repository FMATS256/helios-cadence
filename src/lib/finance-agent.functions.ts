import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFinance(context: { supabase: any; userId: string }) {
  const [f, a] = await Promise.all([
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "finance" }),
    context.supabase.rpc("has_role", { _user_id: context.userId, _role: "master_admin" }),
  ]);
  if (!f.data && !a.data) throw new Error("Only Finance staff can use the Finance agent");
}

export const getFinanceAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFinance(context);
    const [s, t, p] = await Promise.all([
      context.supabase.from("finance_agent_settings").select("*").eq("id", true).single(),
      context.supabase.from("finance_agent_tasks").select("*").order("created_at", { ascending: false }).limit(30),
      context.supabase.from("finance_agent_proposals").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    return { settings: s.data, tasks: t.data ?? [], proposals: p.data ?? [] };
  });

export const saveFinanceAgentSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agent_name: string; persona: string; enabled_roles: string[] }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { error } = await context.supabase.from("finance_agent_settings").update({
      agent_name: data.agent_name.trim() || "Finance Agent", persona: data.persona.slice(0, 2000),
      enabled_roles: data.enabled_roles, updated_by: context.userId, updated_at: new Date().toISOString(),
    }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignFinanceAgentTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; instructions: string; role: string }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    if (!data.title.trim()) throw new Error("Give the task a title");
    const { data: task, error } = await context.supabase.from("finance_agent_tasks").insert({
      title: data.title.trim(), instructions: data.instructions.slice(0, 4000), role: data.role, created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    const { runFinanceAgentTask } = await import("./finance-agent.server");
    await runFinanceAgentTask(task.id);
    return { id: task.id };
  });

export const reviewFinanceProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; decision: "approve" | "reject" }) => d)
  .handler(async ({ data, context }) => {
    await assertFinance(context);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { data: p } = await db.from("finance_agent_proposals")
      .update({ status: data.decision === "reject" ? "rejected" : "applying", reviewed_by: context.userId, reviewed_at: now })
      .eq("id", data.id).eq("status", "pending").select("*").maybeSingle();
    if (!p) throw new Error("This proposal was already reviewed");
    if (data.decision === "reject") return { ok: true };

    const payload: any = p.payload;
    let result = "";
    try {
      if (p.kind === "payment_match") {
        const { data: rows, error } = await db.from("payment_submissions").update({ invoice_id: payload.invoice_id })
          .eq("id", payload.target).eq("status", "pending").is("invoice_id", null).select("id");
        if (error) throw error;
        if (!rows?.length) throw new Error("Payment is no longer pending or already linked");
        result = `Linked to ${payload.invoice_number}; still awaits normal Finance approval`;
      } else if (p.kind === "expense_decision") {
        const status = payload.decision === "approve" ? "approved" : "rejected";
        const { data: rows, error } = await db.from("expenses").update({ status }).eq("id", payload.target).eq("status", "pending").select("id");
        if (error) throw error;
        if (!rows?.length) throw new Error("Expense is no longer pending");
        result = `Expense ${status}`;
      } else if (p.kind === "payment_reminder") {
        const { data: profile } = await db.from("profiles").select("full_name, work_email, email").eq("id", context.userId).maybeSingle();
        const { createAndSendEnquiryEmail } = await import("./inbox.server");
        const sent = await createAndSendEnquiryEmail({
          senderId: context.userId, senderName: profile?.full_name || "IMT Solutions Finance", senderRole: "Finance",
          senderEmail: profile?.work_email || profile?.email || null, to: payload.to, subject: payload.subject,
          body: payload.body, customerId: payload.customer_id, originalSubject: true,
        });
        if (!sent.ok) throw new Error(sent.error);
        result = `Reminder sent to ${payload.to}`;
      } else throw new Error("Unknown proposal type");
      await db.from("finance_agent_proposals").update({ status: "applied", apply_result: result }).eq("id", p.id);
      return { ok: true, result };
    } catch (e: any) {
      await db.from("finance_agent_proposals").update({ status: "failed", apply_result: e?.message ?? "Failed" }).eq("id", p.id);
      throw new Error(e?.message ?? "Failed");
    }
  });
