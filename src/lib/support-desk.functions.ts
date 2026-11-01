/**
 * NOC Support Desk — client lookup and per-service technician actions.
 * Lookups run as the caller (RLS); mailbox actions are role-checked, run on
 * WHM and are logged to the service history.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const DESK_ROLES = ["operations_manager", "cloud_engineer", "technical_support", "noc"];
const clean = (q: string) => q.replace(/[%,()*]/g, " ").trim();

export const deskSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => ({ q: clean(String(d.q ?? "")).slice(0, 80) }))
  .handler(async ({ data, context }) => {
    if (data.q.length < 2) return [];
    const like = `%${data.q}%`;
    const { data: rows, error } = await context.supabase
      .from("customers")
      .select("id,account_number,company_name,primary_email,primary_phone,status")
      .is("archived_at", null)
      .or(`account_number.ilike.${like},company_name.ilike.${like},primary_email.ilike.${like},primary_phone.ilike.${like}`)
      .limit(10);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const deskClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const id = data.id;
    const q = (t: string, cols = "*") => (sb as any).from(t).select(cols).eq("customer_id", id).is("archived_at", null);
    const [cust, contacts, hosting, voip, starlink, servers, storage, subs, assets, licenses, tickets, invoices] = await Promise.all([
      sb.from("customers").select("*").eq("id", id).maybeSingle(),
      q("customer_contacts"),
      q("web_hosting_accounts"),
      q("voip_accounts", "id,voip_number,sip_username,extensions,balance_usd,status,last_synced_at,notes"),
      q("starlink_accounts"),
      q("cloud_servers", "id,name,provider,datacenter,public_ips,power_state,status,ram_mb,cpu_cores,last_synced_at"),
      q("cloud_storage_accounts"),
      sb.from("subscriptions").select("*").eq("customer_id", id).neq("status", "cancelled"),
      q("assets"),
      q("licenses"),
      sb.from("tickets").select("id,ticket_number,subject,status,priority,category,created_at").eq("customer_id", id).is("archived_at", null).order("created_at", { ascending: false }).limit(15),
      sb.from("invoices").select("id,status,due_date,balance_due,total").eq("customer_id", id),
    ]);
    if (cust.error || !cust.data) throw new Error("Client not found or not visible to you");
    let manager: any = null;
    if (cust.data.account_manager_id) {
      const { data: m } = await sb.from("profiles").select("full_name,work_email,email,phone").eq("id", cust.data.account_manager_id).maybeSingle();
      manager = m;
    }
    const today = new Date().toISOString().slice(0, 10);
    const inv = (invoices.data ?? []) as any[];
    const overdue = inv.filter((i) => Number(i.balance_due ?? 0) > 0 && i.due_date && i.due_date < today && i.status !== "paid").length;
    return {
      customer: cust.data, manager, standing: overdue ? `${overdue} overdue invoice(s)` : "Good standing",
      contacts: contacts.data ?? [], hosting: hosting.data ?? [], voip: voip.data ?? [], starlink: starlink.data ?? [],
      servers: servers.data ?? [], storage: storage.data ?? [], subscriptions: subs.data ?? [], assets: assets.data ?? [],
      licenses: licenses.data ?? [], tickets: tickets.data ?? [],
    };
  });

async function loadForMail(context: any, hostingId: string) {
  const { assertRole, admin, loadHostingAccount } = await import("./hosting.server");
  await assertRole(context, DESK_ROLES);
  const db = await admin();
  const row = await loadHostingAccount(db, hostingId);
  if (row.provisioning_status !== "whm" || !row.username) throw new Error("This hosting account is not connected to WHM, so mailboxes can't be managed here.");
  const { loadWhmServer, whm } = await import("./whm.server");
  const api = whm(await loadWhmServer(db, row.whm_server_id));
  return { db, row, api };
}

export const deskMailboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hostingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { api, row } = await loadForMail(context, data.hostingId);
    const res = await api.mailboxes(row.username);
    if (!res.ok) throw new Error((res as any).error);
    const list = ((res as any).data ?? []) as any[];
    return list.map((m) => ({
      email: String(m.email ?? m.login ?? ""),
      usedMb: Number(m.diskused ?? 0),
      quotaMb: m.diskquota === "unlimited" ? null : Number(m.diskquota ?? 0) || null,
      suspended: Boolean(Number(m.suspended_login ?? 0)),
    }));
  });

export const deskMailboxAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { hostingId: string; email: string; action: "reset_password" | "set_quota" | "create" | "suspend" | "unsuspend"; quotaMb?: number }) => {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new Error("Enter a valid email address");
    if ((d.action === "set_quota" || d.action === "create") && !(Number(d.quotaMb) >= 0 && Number(d.quotaMb) <= 102400)) throw new Error("Quota must be 0–102400 MB (0 = unlimited)");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { api, row, db } = await loadForMail(context, data.hostingId);
    if (!data.email.toLowerCase().endsWith("@" + String(row.domain).toLowerCase()) && data.action === "create") {
      throw new Error(`Mailbox must be on ${row.domain}`);
    }
    const { generatePassword } = await import("./whm.server");
    let password: string | null = null;
    const res =
      data.action === "reset_password" ? await api.mailboxPassword(row.username, data.email, (password = generatePassword(16)))
      : data.action === "create" ? await api.mailboxCreate(row.username, data.email, (password = generatePassword(16)), Number(data.quotaMb))
      : data.action === "set_quota" ? await api.mailboxQuota(row.username, data.email, Number(data.quotaMb))
      : await api.mailboxLogin(row.username, data.email, data.action === "suspend");
    const { recordServiceAction } = await import("./hosting.server");
    await recordServiceAction(db, {
      service_type: "web_hosting", row, action: `mailbox_${data.action}${res.ok ? "" : "_failed"}`,
      status: res.ok ? undefined : "failed",
      title: `Mailbox ${data.action.replace("_", " ")} — ${data.email}`,
      description: res.ok ? (data.quotaMb != null ? `Quota ${data.quotaMb} MB` : "Done from NOC Support Desk") : (res as any).error,
      actor_id: context.userId, major: false,
    } as any);
    if (!res.ok) throw new Error((res as any).error);
    return { ok: true, password };
  });

/** Live email health: MX/SPF/DMARC records via public DNS + webmail reachability. */
export const deskEmailHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { domain: string }) => {
    const domain = String(d.domain ?? "").trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error("Invalid domain");
    return { domain };
  })
  .handler(async ({ data }) => {
    const dns = async (name: string, type: string) => {
      try {
        const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`, { headers: { accept: "application/dns-json" } });
        const j: any = await r.json();
        return ((j.Answer ?? []) as any[]).map((a) => String(a.data).replace(/^"|"$/g, ""));
      } catch { return []; }
    };
    const [mx, txt, dmarc] = await Promise.all([dns(data.domain, "MX"), dns(data.domain, "TXT"), dns(`_dmarc.${data.domain}`, "TXT")]);
    let webmail: { ok: boolean; ms: number | null } = { ok: false, ms: null };
    const t = Date.now();
    try {
      const r = await fetch(`https://webmail.${data.domain}`, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(6000) });
      webmail = { ok: r.status < 500, ms: Date.now() - t };
    } catch { /* unreachable */ }
    const spf = txt.find((x) => x.toLowerCase().startsWith("v=spf1")) ?? null;
    return { mx, spf, dmarc: dmarc.find((x) => x.toLowerCase().startsWith("v=dmarc1")) ?? null, webmail };
  });

export const deskOpenTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customerId: string; subject: string; description?: string; priority: string; category: string; onsite?: boolean }) => {
    if (!d.subject?.trim()) throw new Error("Subject is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: c } = await context.supabase.from("customers").select("id,account_number").eq("id", data.customerId).maybeSingle();
    if (!c) throw new Error("Client not visible to you");
    const { data: t, error } = await context.supabase.from("tickets").insert({
      customer_id: c.id, account_number: c.account_number, subject: data.subject.trim(),
      description: [data.onsite ? "[On-site visit required]" : "[Phone support]", data.description ?? ""].join("\n").trim(),
      priority: data.priority, category: data.category, status: "open", created_by: context.userId,
      assigned_team: data.onsite ? "field" : "noc",
    } as any).select("id,ticket_number").single();
    if (error) throw new Error(error.message);
    return t;
  });
