import { createFileRoute } from "@tanstack/react-router";

// Daily reminders tick — emits in-app notifications for:
//  • credentials, SSL certs and warranties expiring within 30 days
//  • subscriptions renewing within 30 days
//  • invoices that just tipped into "overdue"
// Idempotent within a day: uses a stable notification "kind + entity id + window"
// key and skips inserts where the same reminder already exists in the last 24h.

async function runReminders() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const in30 = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const oneDayAgo = new Date(Date.now() - 86400_000).toISOString();

  // Who receives reminders: all users with a staff role (master_admin, ops_manager, finance, account_manager)
  const roles = ["master_admin", "operations_manager", "finance", "account_manager"] as const;
  const { data: staff } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role")
    .in("role", roles as any);
  const staffIds = Array.from(new Set((staff ?? []).map((r: any) => r.user_id)));
  if (staffIds.length === 0) return { ok: true, message: "no staff to notify" };

  let sent = 0;

  const alreadySent = async (kind: string, entityKey: string, userId: string) => {
    const { data } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("kind", kind)
      .eq("user_id", userId)
      .gte("created_at", oneDayAgo)
      .ilike("link", `%${entityKey}%`)
      .limit(1);
    return (data?.length ?? 0) > 0;
  };

  const notifyAll = async (kind: string, title: string, body: string, link: string, entityKey: string) => {
    for (const uid of staffIds) {
      if (await alreadySent(kind, entityKey, uid)) continue;
      await supabaseAdmin.from("notifications").insert({ user_id: uid, kind, title, body, link });
      sent++;
    }
  };

  // 1) Credentials expiring
  const { data: creds } = await supabaseAdmin
    .from("credentials")
    .select("id,name,expires_at,account_number")
    .is("archived_at", null)
    .not("expires_at", "is", null)
    .lte("expires_at", in30);
  for (const c of creds ?? []) {
    const days = Math.max(0, Math.ceil((new Date((c as any).expires_at).getTime() - Date.now()) / 86400_000));
    await notifyAll(
      "credential_expiring",
      `${(c as any).name} expires in ${days} day${days === 1 ? "" : "s"}`,
      `${(c as any).account_number ?? "Internal"} · rotate before expiry.`,
      `/credentials?id=${(c as any).id}`,
      (c as any).id,
    );
  }

  // 2) Subscription renewals ≤ 30 days
  const { data: subs } = await supabaseAdmin
    .from("subscriptions" as any)
    .select("id,plan_name,next_renewal,account_number,status")
    .eq("status", "active")
    .not("next_renewal", "is", null)
    .lte("next_renewal", in30);
  for (const s of (subs ?? []) as any[]) {
    const days = Math.max(0, Math.ceil((new Date(s.next_renewal).getTime() - Date.now()) / 86400_000));
    await notifyAll(
      "subscription_renewing",
      `${s.plan_name} renews in ${days} day${days === 1 ? "" : "s"}`,
      `${s.account_number} · confirm renewal terms.`,
      `/subscriptions?id=${s.id}`,
      s.id,
    );
  }

  // 3) Cloud services renewal (M365, hosting etc.)
  const { data: cloud } = await supabaseAdmin
    .from("cloud_services" as any)
    .select("id,service_name,renewal_date,account_number,status")
    .eq("status", "active")
    .not("renewal_date", "is", null)
    .lte("renewal_date", in30);
  for (const c of (cloud ?? []) as any[]) {
    const days = Math.max(0, Math.ceil((new Date(c.renewal_date).getTime() - Date.now()) / 86400_000));
    await notifyAll(
      "cloud_renewing",
      `${c.service_name} renews in ${days} day${days === 1 ? "" : "s"}`,
      `${c.account_number} · check seats & spend.`,
      `/cloud?id=${c.id}`,
      c.id,
    );
  }

  // 4) Asset warranties expiring
  const { data: assets } = await supabaseAdmin
    .from("assets" as any)
    .select("id,asset_tag,make,model,warranty_expires,account_number")
    .is("archived_at", null)
    .not("warranty_expires", "is", null)
    .lte("warranty_expires", in30);
  for (const a of (assets ?? []) as any[]) {
    const days = Math.max(0, Math.ceil((new Date(a.warranty_expires).getTime() - Date.now()) / 86400_000));
    const label = `${a.make ?? ""} ${a.model ?? ""}`.trim() || a.asset_tag || "Asset";
    await notifyAll(
      "warranty_expiring",
      `Warranty on ${label} expires in ${days} day${days === 1 ? "" : "s"}`,
      `${a.account_number ?? "Internal"} · plan renewal or replacement.`,
      `/assets/${a.id}`,
      a.id,
    );
  }

  // 5) Overdue invoices — mark status + notify finance
  const { data: overdue } = await supabaseAdmin
    .from("invoices" as any)
    .select("id,invoice_number,total,currency,due_date,account_number,status")
    .not("due_date", "is", null)
    .not("status", "in", "(paid,void,partial)")
    .lt("due_date", now.slice(0, 10));
  for (const inv of (overdue ?? []) as any[]) {
    if (inv.status !== "overdue") {
      await supabaseAdmin.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
    }
    await notifyAll(
      "invoice_overdue",
      `Invoice ${inv.invoice_number} is overdue`,
      `${inv.account_number} · ${inv.currency} ${Number(inv.total).toFixed(2)}`,
      `/invoices/${inv.id}`,
      inv.id,
    );
  }

  // 6) Overdue installments on customer payment plans — mark + notify finance
  const { data: dueInstallments } = await supabaseAdmin
    .from("payment_schedule_installments" as any)
    .select("id,schedule_id,customer_id,sequence,due_date,amount_due,amount_paid,status")
    .not("status", "in", "(paid,cancelled)")
    .lt("due_date", now.slice(0, 10));
  for (const it of (dueInstallments ?? []) as any[]) {
    const outstanding = Number(it.amount_due ?? 0) - Number(it.amount_paid ?? 0);
    if (outstanding <= 0.005) continue;
    if (it.status !== "overdue") {
      await supabaseAdmin.from("payment_schedule_installments" as any).update({ status: "overdue" }).eq("id", it.id);
    }
    const { data: cust } = await supabaseAdmin
      .from("customers" as any)
      .select("company_name,account_number")
      .eq("id", it.customer_id)
      .maybeSingle();
    await notifyAll(
      "installment_overdue",
      `Installment ${it.sequence} overdue`,
      `${(cust as any)?.company_name ?? "Customer"} (${(cust as any)?.account_number ?? "—"}) · USD ${outstanding.toFixed(2)} due ${it.due_date}`,
      (cust as any)?.account_number ? `/customers/${(cust as any).account_number}` : "/finance",
      it.id,
    );
    await supabaseAdmin.from("customer_timeline" as any).insert({
      customer_id: it.customer_id,
      event_type: "installment_overdue",
      title: `Installment ${it.sequence} overdue`,
      description: `USD ${outstanding.toFixed(2)} was due on ${it.due_date}.`,
    });
  }

  return { ok: true, sent };

}

export const Route = createFileRoute("/api/public/hooks/reminders-tick")({
  server: {
    handlers: {
      GET: async () => new Response(JSON.stringify(await runReminders()), { headers: { "content-type": "application/json" } }),
      POST: async () => new Response(JSON.stringify(await runReminders()), { headers: { "content-type": "application/json" } }),
    },
  },
});
