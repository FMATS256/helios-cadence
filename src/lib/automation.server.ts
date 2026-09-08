/**
 * Automation & notification engine (Block 9)
 * ==========================================
 * A configurable rule engine that runs on a schedule (pg_cron → the
 * /api/public/hooks/automation-tick route) or on demand from the Automation
 * console. Every rule is idempotent, records an `automation_runs` row and
 * writes customer timeline / audit entries for anything it changes.
 *
 * Configuration lives in `system_settings` under the key `automation`, so
 * operations can retune thresholds without a deploy.
 */

export type RuleKey =
  | "renewal_reminders"
  | "invoice_reminders"
  | "overdue_escalation"
  | "auto_suspend"
  | "monitoring_alerts"
  | "sla_alerts"
  | "report_digest";

export type RuleConfig = {
  enabled: boolean;
  [k: string]: any;
};

export const RULES: Array<{
  key: RuleKey;
  title: string;
  description: string;
  defaults: RuleConfig;
}> = [
  {
    key: "renewal_reminders",
    title: "Renewal reminders",
    description: "Emails the customer and alerts staff before a subscription or cloud service renews.",
    defaults: { enabled: true, days: [30, 7, 1], email_customer: true },
  },
  {
    key: "invoice_reminders",
    title: "Invoice due reminders",
    description: "Sends a payment reminder before an invoice falls due.",
    defaults: { enabled: true, before_days: [7, 3, 1] },
  },
  {
    key: "overdue_escalation",
    title: "Overdue escalation",
    description: "Marks invoices overdue, chases the customer and escalates to finance.",
    defaults: { enabled: true, chase_days: [1, 7, 14, 30] },
  },
  {
    key: "auto_suspend",
    title: "Auto-suspend on non-payment",
    description: "Suspends active services once an invoice passes the grace period.",
    defaults: { enabled: false, grace_days: 30 },
  },
  {
    key: "monitoring_alerts",
    title: "Monitoring alerts",
    description: "Raises staff notifications for monitors that are down or have open incidents.",
    defaults: { enabled: true },
  },
  {
    key: "sla_alerts",
    title: "Ticket SLA alerts",
    description: "Warns the assignee and managers when a ticket is close to breaching its SLA.",
    defaults: { enabled: true, warn_minutes: 120 },
  },
  {
    key: "report_digest",
    title: "Scheduled operations digest",
    description: "Emails the daily operations summary (MRR, collections, tickets, health) to recipients.",
    defaults: { enabled: false, cadence: "daily", recipients: [] as string[], hour: 7 },
  },
];

export const SETTINGS_KEY = "automation";

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export function defaultConfig(): Record<string, RuleConfig> {
  return Object.fromEntries(RULES.map((r) => [r.key, { ...r.defaults }]));
}

export async function loadConfig(db: any): Promise<Record<string, RuleConfig>> {
  const { data } = await db.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const stored = (data?.value ?? {}) as Record<string, any>;
  const base = defaultConfig();
  for (const key of Object.keys(base)) base[key] = { ...base[key], ...(stored[key] ?? {}) } as RuleConfig;
  return base;
}

export async function saveConfig(db: any, config: Record<string, RuleConfig>, userId?: string) {
  const { error } = await db
    .from("system_settings")
    .upsert({ key: SETTINGS_KEY, value: config, updated_by: userId ?? null }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return config;
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const DAY = 86_400_000;
const dayStr = (d: Date | number) => new Date(d).toISOString().slice(0, 10);
const num = (v: any) => Number(v || 0);
const daysUntil = (d: any) => Math.ceil((new Date(d).getTime() - Date.now()) / DAY);

async function staffIds(db: any, roles: string[]) {
  const { data } = await db.from("user_roles").select("user_id").in("role", roles as any);
  return Array.from(new Set(((data ?? []) as any[]).map((r) => r.user_id)));
}

/** Insert a staff notification unless the same one already went out today. */
async function notifyStaff(
  db: any,
  ids: string[],
  kind: string,
  title: string,
  body: string,
  link: string,
) {
  const since = new Date(Date.now() - DAY).toISOString();
  let sent = 0;
  for (const uid of ids) {
    const { data: dupe } = await db
      .from("notifications")
      .select("id")
      .eq("user_id", uid)
      .eq("kind", kind)
      .eq("title", title)
      .gte("created_at", since)
      .limit(1);
    if ((dupe?.length ?? 0) > 0) continue;
    await db.from("notifications").insert({ user_id: uid, kind, title, body, link });
    sent++;
  }
  return sent;
}

async function timeline(db: any, row: {
  customer_id?: string | null;
  account_number?: string | null;
  event_type: string;
  title: string;
  description?: string | null;
  metadata?: any;
}) {
  if (!row.customer_id) return;
  await db.from("customer_timeline").insert({
    customer_id: row.customer_id,
    account_number: row.account_number ?? null,
    event_type: row.event_type,
    title: row.title,
    description: row.description ?? null,
    metadata: { source: "automation", ...(row.metadata ?? {}) },
  });
}

async function auditRow(db: any, entity_type: string, entity_id: string, action: string, payload: any) {
  await db.from("audit_log").insert({
    action,
    entity_type,
    entity_id,
    module: "automation",
    new_value: payload ?? null,
  });
}

async function customersByKey(db: any) {
  const { data } = await db
    .from("customers")
    .select("id,account_number,company_name,primary_email,status,account_manager_id");
  const byId = new Map<string, any>();
  const byAcct = new Map<string, any>();
  for (const c of (data ?? []) as any[]) {
    byId.set(c.id, c);
    if (c.account_number) byAcct.set(c.account_number, c);
  }
  return { byId, byAcct };
}

export const SITE_URL = "https://management.imtsolutions.co.zw";

/**
 * Branded sender for automated customer mail: the account manager who owns the
 * customer, falling back to the generic billing mailbox.
 */
async function senderResolver(db: any) {
  const { data } = await db.from("profiles").select("id, full_name, email");
  const byId = new Map<string, any>();
  for (const p of (data ?? []) as any[]) byId.set(p.id, p);
  return (cust: any) => {
    const p = cust?.account_manager_id ? byId.get(cust.account_manager_id) : null;
    const email = String(p?.email ?? "").trim();
    const name = p?.full_name || (email ? email.split("@")[0] : "") || "IMT Solutions Billing";
    return {
      fromName: `${name} (IMT Solutions)`,
      fromLocal: email || "billing",
      ...(email ? { replyTo: email } : {}),
    };
  };
}

/** Outstanding balance per invoice id (total minus reconciled allocations). */
async function balancesFor(db: any, invoices: any[]) {
  const ids = invoices.map((i) => i.id);
  const out = new Map<string, number>();
  for (const i of invoices) out.set(i.id, Math.round(num(i.total) * 100) / 100);
  if (!ids.length) return out;
  const { data } = await db.from("payment_allocations").select("invoice_id, amount").in("invoice_id", ids);
  for (const a of (data ?? []) as any[]) {
    const cur = out.get(a.invoice_id) ?? 0;
    out.set(a.invoice_id, Math.round((cur - num(a.amount)) * 100) / 100);
  }
  return out;
}

/** Log an outbound automated email on the customer's communications thread. */
async function logCommunication(db: any, cust: any, subject: string, body: string) {
  if (!cust?.id) return;
  await db
    .from("communications")
    .insert({
      customer_id: cust.id,
      account_number: cust.account_number ?? null,
      channel: "email",
      direction: "outbound",
      subject,
      body,
      status: "sent",
    })
    .then(undefined, () => {});
}

export type RuleOutcome = {
  rule: RuleKey;
  status: "success" | "skipped" | "error";
  processed: number;
  notified: number;
  emailed: number;
  actioned: number;
  error?: string | null;
  details?: Record<string, any>;
};

const empty = (rule: RuleKey): RuleOutcome => ({ rule, status: "success", processed: 0, notified: 0, emailed: 0, actioned: 0, details: {} });

/* ------------------------------------------------------------------ *
 * Rules
 * ------------------------------------------------------------------ */

async function renewalReminders(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("renewal_reminders");
  const windows: number[] = (cfg["days"] ?? [30, 7, 1]).map(Number).sort((a: number, b: number) => b - a);
  const horizon = dayStr(Date.now() + Math.max(...windows) * DAY);
  const { byId, byAcct } = await customersByKey(db);
  const ids = await staffIds(db, ["master_admin", "operations_manager", "account_manager", "finance"]);
  const { notify } = await import("./notify.server");

  const [subs, cloud] = await Promise.all([
    db.from("subscriptions").select("id,customer_id,account_number,plan_name,amount,currency,billing_cycle,next_renewal,status,auto_renew")
      .eq("status", "active").not("next_renewal", "is", null).lte("next_renewal", horizon).gte("next_renewal", dayStr(Date.now())),
    db.from("cloud_services").select("id,customer_id,account_number,service_name,monthly_cost,renewal_date,status")
      .is("archived_at", null).eq("status", "active").not("renewal_date", "is", null)
      .lte("renewal_date", horizon).gte("renewal_date", dayStr(Date.now())),
  ]);

  const items = [
    ...((subs.data ?? []) as any[]).map((s) => ({
      id: s.id, kind: "subscription", customer_id: s.customer_id, account_number: s.account_number,
      name: s.plan_name, amount: num(s.amount), currency: s.currency ?? "USD",
      cycle: s.billing_cycle ?? "monthly", date: s.next_renewal, link: `/subscriptions?id=${s.id}`,
    })),
    ...((cloud.data ?? []) as any[]).map((c) => ({
      id: c.id, kind: "cloud_service", customer_id: c.customer_id, account_number: c.account_number,
      name: c.service_name, amount: num(c.monthly_cost), currency: "USD",
      cycle: "monthly", date: c.renewal_date, link: `/cloud?id=${c.id}`,
    })),
  ];

  for (const it of items) {
    const days = daysUntil(it.date);
    const hit = windows.find((w) => w === days);
    if (hit === undefined) continue;
    out.processed++;
    const cust = it.customer_id ? byId.get(it.customer_id) : byAcct.get(it.account_number);
    out.notified += await notifyStaff(
      db, ids, "renewal_due",
      `${it.name} renews in ${days} day${days === 1 ? "" : "s"}`,
      `${cust?.company_name ?? it.account_number ?? "Internal"} · ${it.currency} ${it.amount.toFixed(2)} / ${it.cycle}`,
      it.link,
    );
    if (cfg["email_customer"] !== false && cust?.primary_email) {
      await notify("renewal-reminder", cust.primary_email, {
        companyName: cust.company_name ?? "there",
        planName: it.name,
        renewalDate: it.date,
        daysUntilRenewal: days,
        amount: it.amount,
        currency: it.currency,
        billingCycle: it.cycle,
      }, `renewal-${it.kind}-${it.id}-${it.date}-${days}`);
      out.emailed++;
      await timeline(db, {
        customer_id: it.customer_id, account_number: it.account_number,
        event_type: "renewal_reminder_sent",
        title: `Renewal reminder sent for ${it.name}`,
        description: `${days} day notice · renews ${it.date}`,
        metadata: { rule: "renewal_reminders", days },
      });
    }
  }
  return out;
}

async function invoiceReminders(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("invoice_reminders");
  const windows: number[] = (cfg["before_days"] ?? [7, 3, 1]).map(Number);
  const horizon = dayStr(Date.now() + Math.max(...windows) * DAY);
  const { byId, byAcct } = await customersByKey(db);
  const senderFor = await senderResolver(db);
  const { notify } = await import("./notify.server");
  const { data: invs } = await db
    .from("invoices")
    .select("id,invoice_number,customer_id,account_number,total,currency,due_date,status")
    .is("archived_at", null)
    .not("due_date", "is", null)
    .not("status", "in", "(paid,void,cancelled)")
    .gte("due_date", dayStr(Date.now()))
    .lte("due_date", horizon);

  const list = (invs ?? []) as any[];
  const balances = await balancesFor(db, list);

  for (const inv of list) {
    const days = daysUntil(inv.due_date);
    if (!windows.includes(days)) continue;
    const balance = balances.get(inv.id) ?? num(inv.total);
    if (balance <= 0.005) continue;
    out.processed++;
    const cust = inv.customer_id ? byId.get(inv.customer_id) : byAcct.get(inv.account_number);
    if (!cust?.primary_email) continue;
    const invoiceUrl = `${SITE_URL}/invoices/${inv.id}`;
    await notify("payment-reminder", cust.primary_email, {
      companyName: cust.company_name ?? "there",
      invoiceNumber: inv.invoice_number,
      amountDue: balance,
      currency: inv.currency ?? "USD",
      dueDate: inv.due_date,
      daysUntilDue: days,
      invoiceUrl,
    }, `invoice-due-${inv.id}-${days}`, senderFor(cust));
    out.emailed++;
    await timeline(db, {
      customer_id: inv.customer_id, account_number: inv.account_number,
      event_type: "payment_reminder_sent",
      title: `Payment reminder sent for ${inv.invoice_number}`,
      description: `Due in ${days} day${days === 1 ? "" : "s"} · ${inv.currency ?? "USD"} ${balance.toFixed(2)} outstanding`,
      metadata: { rule: "invoice_reminders", days, invoice_id: inv.id, to: cust.primary_email, amount: balance },
    });
    await logCommunication(
      db, cust,
      `Payment reminder: Invoice ${inv.invoice_number}`,
      `Automated reminder emailed to ${cust.primary_email} — due in ${days} day(s), ${inv.currency ?? "USD"} ${balance.toFixed(2)} outstanding. ${invoiceUrl}`,
    );
  }
  return out;
}

async function overdueEscalation(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("overdue_escalation");
  const chase: number[] = (cfg["chase_days"] ?? [1, 7, 14, 30]).map(Number);
  const { byId, byAcct } = await customersByKey(db);
  const senderFor = await senderResolver(db);
  const ids = await staffIds(db, ["master_admin", "finance", "operations_manager"]);
  const { notify } = await import("./notify.server");
  const { data: invs } = await db
    .from("invoices")
    .select("id,invoice_number,customer_id,account_number,total,currency,due_date,status")
    .is("archived_at", null)
    .not("due_date", "is", null)
    .not("status", "in", "(paid,void,cancelled)")
    .lt("due_date", dayStr(Date.now()));

  const list = (invs ?? []) as any[];
  const balances = await balancesFor(db, list);
  const maxChase = chase.length ? Math.max(...chase) : 30;

  for (const inv of list) {
    const balance = balances.get(inv.id) ?? num(inv.total);
    if (balance <= 0.005) continue;
    out.processed++;
    const overdueDays = Math.abs(daysUntil(inv.due_date));
    if (inv.status !== "overdue") {
      await db.from("invoices").update({ status: "overdue" }).eq("id", inv.id);
      await auditRow(db, "invoices", inv.id, "invoice_marked_overdue", { days: overdueDays });
      out.actioned++;
    }
    const cust = inv.customer_id ? byId.get(inv.customer_id) : byAcct.get(inv.account_number);
    out.notified += await notifyStaff(
      db, ids, "invoice_overdue",
      `Invoice ${inv.invoice_number} is ${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`,
      `${cust?.company_name ?? inv.account_number} · ${inv.currency ?? "USD"} ${balance.toFixed(2)} outstanding`,
      `/invoices/${inv.id}`,
    );
    // Chase on the configured milestones, then keep a weekly cadence after the
    // last milestone until the invoice is settled.
    const dueChase = chase.includes(overdueDays) || (overdueDays > maxChase && overdueDays % 7 === 0);
    if (dueChase && cust?.primary_email) {
      const invoiceUrl = `${SITE_URL}/invoices/${inv.id}`;
      await notify("payment-reminder", cust.primary_email, {
        companyName: cust.company_name ?? "there",
        invoiceNumber: inv.invoice_number,
        amountDue: balance,
        currency: inv.currency ?? "USD",
        dueDate: inv.due_date,
        daysUntilDue: -overdueDays,
        invoiceUrl,
      }, `invoice-overdue-${inv.id}-${overdueDays}`, senderFor(cust));
      out.emailed++;
      await auditRow(db, "invoices", inv.id, "overdue_reminder_emailed", {
        to: cust.primary_email, days: overdueDays, amount: balance,
      });
      await timeline(db, {
        customer_id: inv.customer_id, account_number: inv.account_number,
        event_type: "overdue_notice_sent",
        title: `Overdue notice sent for ${inv.invoice_number}`,
        description: `${overdueDays} days past due · ${inv.currency ?? "USD"} ${balance.toFixed(2)} outstanding · emailed to ${cust.primary_email}`,
        metadata: { rule: "overdue_escalation", days: overdueDays, invoice_id: inv.id, amount: balance },
      });
      await logCommunication(
        db, cust,
        `Overdue notice: Invoice ${inv.invoice_number}`,
        `Automated overdue notice emailed to ${cust.primary_email} — ${overdueDays} day(s) past due, ${inv.currency ?? "USD"} ${balance.toFixed(2)} outstanding. ${invoiceUrl}`,
      );
    }
  }
  return out;
}

const SERVICE_TABLES: Array<{ table: string; label: string }> = [
  { table: "subscriptions", label: "Subscription" },
  { table: "cloud_services", label: "Cloud service" },
  { table: "web_hosting_accounts", label: "Hosting account" },
  { table: "cloud_storage_accounts", label: "Cloud storage" },
  { table: "managed_nas_accounts", label: "Managed NAS" },
  { table: "voip_accounts", label: "VoIP account" },
  { table: "starlink_accounts", label: "Starlink service" },
];

async function autoSuspend(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("auto_suspend");
  const grace = Number(cfg["grace_days"] ?? 30);
  const cutoff = dayStr(Date.now() - grace * DAY);
  const { byId } = await customersByKey(db);
  const ids = await staffIds(db, ["master_admin", "finance", "operations_manager", "account_manager"]);
  const { data: invs } = await db
    .from("invoices")
    .select("id,invoice_number,customer_id,account_number,total,due_date,status")
    .is("archived_at", null)
    .not("customer_id", "is", null)
    .not("status", "in", "(paid,void,cancelled)")
    .lt("due_date", cutoff);

  const offenders = new Map<string, any>();
  for (const inv of (invs ?? []) as any[]) {
    const r = offenders.get(inv.customer_id) ?? { customer_id: inv.customer_id, account_number: inv.account_number, amount: 0, invoices: [] as string[] };
    r.amount += num(inv.total);
    r.invoices.push(inv.invoice_number);
    offenders.set(inv.customer_id, r);
  }

  for (const o of offenders.values()) {
    out.processed++;
    let suspendedNow = 0;
    for (const t of SERVICE_TABLES) {
      const { data: rows } = await db.from(t.table).select("id").eq("customer_id", o.customer_id).eq("status", "active");
      for (const row of (rows ?? []) as any[]) {
        await db.from(t.table).update({ status: "suspended" }).eq("id", row.id);
        await auditRow(db, t.table, row.id, "auto_suspended_non_payment", {
          grace_days: grace, invoices: o.invoices, outstanding: Number(o.amount.toFixed(2)),
        });
        suspendedNow++;
      }
    }
    if (!suspendedNow) continue;
    out.actioned += suspendedNow;
    const cust = byId.get(o.customer_id);
    await timeline(db, {
      customer_id: o.customer_id, account_number: o.account_number,
      event_type: "services_auto_suspended",
      title: `${suspendedNow} service${suspendedNow === 1 ? "" : "s"} auto-suspended for non-payment`,
      description: `Invoices ${o.invoices.join(", ")} unpaid beyond ${grace} days`,
      metadata: { rule: "auto_suspend", outstanding: Number(o.amount.toFixed(2)) },
    });
    out.notified += await notifyStaff(
      db, ids, "auto_suspend",
      `${cust?.company_name ?? o.account_number}: ${suspendedNow} service(s) suspended`,
      `Unpaid beyond ${grace} days · USD ${o.amount.toFixed(2)}`,
      `/customers/${o.account_number}`,
    );
  }
  return out;
}

async function monitoringAlerts(db: any): Promise<RuleOutcome> {
  const out = empty("monitoring_alerts");
  const ids = await staffIds(db, ["master_admin", "noc", "technical_support", "operations_manager", "cloud_engineer"]);
  const { data: checks } = await db
    .from("monitoring_checks")
    .select("id,name,target,status,account_number,last_checked_at")
    .is("archived_at", null)
    .eq("status", "down");
  for (const c of (checks ?? []) as any[]) {
    out.processed++;
    out.notified += await notifyStaff(
      db, ids, "monitor_down",
      `${c.name} is DOWN`,
      `${c.account_number ?? "Internal"} · ${c.target ?? ""}`.trim(),
      `/monitoring?id=${c.id}`,
    );
  }
  return out;
}

async function slaAlerts(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("sla_alerts");
  const warnMin = Number(cfg["warn_minutes"] ?? 120);
  const managers = await staffIds(db, ["master_admin", "operations_manager", "technical_support"]);
  const limit = new Date(Date.now() + warnMin * 60_000).toISOString();
  const { data: tickets } = await db
    .from("tickets")
    .select("id,ticket_number,subject,priority,status,sla_due_at,assigned_to,account_number")
    .is("archived_at", null)
    .not("sla_due_at", "is", null)
    .not("status", "in", "(resolved,closed)")
    .lte("sla_due_at", limit);
  for (const t of (tickets ?? []) as any[]) {
    out.processed++;
    const breached = new Date(t.sla_due_at).getTime() < Date.now();
    const targets = Array.from(new Set([...(t.assigned_to ? [t.assigned_to] : []), ...managers]));
    out.notified += await notifyStaff(
      db, targets,
      breached ? "sla_breached" : "sla_warning",
      `${breached ? "SLA breached" : "SLA due soon"} — ${t.ticket_number}`,
      `${t.priority ?? "normal"} · ${t.subject}`,
      `/tickets/${t.id}`,
    );
  }
  return out;
}

async function reportDigest(db: any, cfg: RuleConfig): Promise<RuleOutcome> {
  const out = empty("report_digest");
  const recipients: string[] = (cfg["recipients"] ?? []).filter((r: string) => /@/.test(r));
  if (!recipients.length) {
    return { ...out, status: "skipped", details: { reason: "no recipients configured" } };
  }
  const cadence = String(cfg["cadence"] ?? "daily");
  const now = new Date();
  if (cadence === "weekly" && now.getUTCDay() !== 1) {
    return { ...out, status: "skipped", details: { reason: "weekly digest only runs on Mondays" } };
  }
  const { buildDigest } = await import("./reports.server");
  const digest = await buildDigest(db);
  const { notify } = await import("./notify.server");
  const stamp = dayStr(now);
  for (const to of recipients) {
    await notify("ops-digest", to, {
      period: digest.period,
      cadence,
      metrics: digest.metrics,
      generatedAt: now.toISOString(),
    }, `ops-digest-${stamp}-${to}`);
    out.emailed++;
    out.processed++;
  }
  return { ...out, details: { period: digest.period, metrics: digest.metrics } };
}

/* ------------------------------------------------------------------ *
 * Runner
 * ------------------------------------------------------------------ */

export async function runRule(db: any, key: RuleKey, cfg: RuleConfig): Promise<RuleOutcome> {
  switch (key) {
    case "renewal_reminders": return renewalReminders(db, cfg);
    case "invoice_reminders": return invoiceReminders(db, cfg);
    case "overdue_escalation": return overdueEscalation(db, cfg);
    case "auto_suspend": return autoSuspend(db, cfg);
    case "monitoring_alerts": return monitoringAlerts(db);
    case "sla_alerts": return slaAlerts(db, cfg);
    case "report_digest": return reportDigest(db, cfg);
    default: return { ...empty(key), status: "skipped" };
  }
}

export async function runAutomation(opts: {
  rules?: RuleKey[];
  trigger?: "cron" | "manual";
  userId?: string | null;
  force?: boolean;
} = {}) {
  const db = await admin();
  const config = await loadConfig(db);
  const keys = (opts.rules?.length ? opts.rules : RULES.map((r) => r.key)) as RuleKey[];
  const results: RuleOutcome[] = [];

  for (const key of keys) {
    const cfg = config[key] ?? { enabled: false };
    if (!cfg.enabled && !opts.force) {
      results.push({ ...empty(key), status: "skipped", details: { reason: "rule disabled" } });
      continue;
    }
    const started = Date.now();
    let outcome: RuleOutcome;
    try {
      outcome = await runRule(db, key, cfg);
    } catch (e: any) {
      outcome = { ...empty(key), status: "error", error: e?.message ?? String(e) };
    }
    results.push(outcome);
    await db.from("automation_runs").insert({
      rule: key,
      status: outcome.status,
      trigger: opts.trigger ?? "cron",
      processed: outcome.processed,
      notified: outcome.notified,
      emailed: outcome.emailed,
      actioned: outcome.actioned,
      duration_ms: Date.now() - started,
      error: outcome.error ?? null,
      details: outcome.details ?? {},
      started_by: opts.userId ?? null,
    });
  }

  return {
    ran_at: new Date().toISOString(),
    trigger: opts.trigger ?? "cron",
    results,
    totals: results.reduce(
      (t, r) => ({
        processed: t.processed + r.processed,
        notified: t.notified + r.notified,
        emailed: t.emailed + r.emailed,
        actioned: t.actioned + r.actioned,
        errors: t.errors + (r.status === "error" ? 1 : 0),
      }),
      { processed: 0, notified: 0, emailed: 0, actioned: 0, errors: 0 },
    ),
  };
}
