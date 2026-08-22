// Server-only alert engine. Evaluates live operational signals against
// public.alert_rules and raises / refreshes / auto-resolves ops_alerts.
// Every alert is deduplicated by a stable key so a persistent fault produces
// one alert with an occurrence counter, not a flood.

export type RaisedAlert = {
  dedupe_key: string;
  rule_id: string | null;
  source: string;
  severity: string;
  title: string;
  detail?: string | null;
  metric_value?: number | null;
  customer_id?: string | null;
  account_number?: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
};

type Rule = {
  id: string;
  metric: string;
  source: string;
  severity: string;
  threshold: number | null;
  enabled: boolean;
  name: string;
};

function pct(used: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((used / total) * 100);
}

/** Evaluate every enabled rule and reconcile the open alert set. */
export async function evaluateAlerts(admin: any) {
  const { data: ruleRows } = await admin.from("alert_rules").select("*").eq("enabled", true);
  const rules = (ruleRows ?? []) as Rule[];
  const byMetric = new Map(rules.map((r) => [r.metric, r]));
  const raised: RaisedAlert[] = [];

  const push = (metric: string, a: Omit<RaisedAlert, "rule_id" | "severity" | "source">) => {
    const rule = byMetric.get(metric);
    if (!rule) return;
    raised.push({ ...a, rule_id: rule.id, severity: rule.severity, source: rule.source });
  };
  const thresholdOf = (metric: string, fallback: number) =>
    Number(byMetric.get(metric)?.threshold ?? fallback);

  // ---- Monitoring checks down -------------------------------------------
  if (byMetric.has("check_down")) {
    const { data: checks } = await admin
      .from("monitoring_checks")
      .select("id, name, target, status, last_error, customer_id, account_number")
      .eq("enabled", true)
      .is("archived_at", null);
    for (const c of checks ?? []) {
      if (c.status === "down") {
        push("check_down", {
          dedupe_key: `check_down:${c.id}`,
          title: `${c.name} is offline`,
          detail: c.last_error || `No response from ${c.target}`,
          customer_id: c.customer_id,
          account_number: c.account_number,
          entity_type: "monitoring_checks",
          entity_id: c.id,
        });
      }
    }
  }

  // ---- Cloud servers not running ----------------------------------------
  if (byMetric.has("power_state")) {
    const { data: servers } = await admin
      .from("cloud_servers")
      .select("id, name, power_state, status, customer_id, account_number, provider")
      .is("archived_at", null);
    for (const s of servers ?? []) {
      const state = String(s.power_state ?? "").toLowerCase();
      const bad = ["off", "stopped", "shutdown", "error", "failed"].includes(state);
      if (bad && s.status !== "terminated") {
        push("power_state", {
          dedupe_key: `power_state:${s.id}`,
          title: `Server ${s.name} is ${state || "not running"}`,
          detail: `${s.provider} · lifecycle ${s.status}`,
          customer_id: s.customer_id,
          account_number: s.account_number,
          entity_type: "cloud_servers",
          entity_id: s.id,
        });
      }
    }
  }

  // ---- Hosting disk usage ------------------------------------------------
  if (byMetric.has("disk_percent")) {
    const limit = thresholdOf("disk_percent", 85);
    const { data: hosting } = await admin
      .from("web_hosting_accounts")
      .select("id, domain, disk_used_mb, disk_quota_gb, customer_id, account_number, status")
      .is("archived_at", null);
    for (const h of hosting ?? []) {
      const quotaMb = Number(h.disk_quota_gb ?? 0) * 1024;
      const usedMb = Number(h.disk_used_mb ?? 0);
      const used = pct(usedMb, quotaMb);
      if (quotaMb > 0 && used >= limit) {
        push("disk_percent", {
          dedupe_key: `disk_percent:${h.id}`,
          title: `${h.domain} disk usage at ${used}%`,
          detail: `${Math.round(usedMb)} MB of ${Math.round(quotaMb)} MB used`,
          metric_value: used,
          customer_id: h.customer_id,
          account_number: h.account_number,
          entity_type: "web_hosting_accounts",
          entity_id: h.id,
        });
      }
    }
  }

  // ---- Cloud storage / NAS capacity -------------------------------------
  if (byMetric.has("storage_percent")) {
    const limit = thresholdOf("storage_percent", 85);
    const { data: storage } = await admin
      .from("cloud_storage_accounts")
      .select("id, name, used_tb, storage_tb, customer_id, account_number")
      .is("archived_at", null);
    for (const s of storage ?? []) {
      const used = pct(Number(s.used_tb ?? 0), Number(s.storage_tb ?? 0));
      if (Number(s.storage_tb ?? 0) > 0 && used >= limit) {
        push("storage_percent", {
          dedupe_key: `storage_percent:${s.id}`,
          title: `${s.name} storage at ${used}%`,
          detail: `${s.used_tb} TB of ${s.storage_tb} TB used`,
          metric_value: used,
          customer_id: s.customer_id,
          account_number: s.account_number,
          entity_type: "cloud_storage_accounts",
          entity_id: s.id,
        });
      }
    }
  }

  // ---- Backup failures ---------------------------------------------------
  if (byMetric.has("backup_failed")) {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: backups } = await admin
      .from("server_backups")
      .select("id, server_id, kind, status, error, taken_at, created_at")
      .eq("status", "failed")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100);
    for (const b of backups ?? []) {
      push("backup_failed", {
        dedupe_key: `backup_failed:${b.id}`,
        title: `Backup failed (${b.kind || "snapshot"})`,
        detail: b.error || "The backup job did not complete.",
        entity_type: "server_backups",
        entity_id: b.id,
      });
    }
  }

  // ---- Provisioning failures --------------------------------------------
  if (byMetric.has("provision_failed")) {
    const since = new Date(Date.now() - 7 * 864e5).toISOString();
    const { data: plans } = await admin
      .from("provisioning_plans")
      .select("id, provider, status, rejected_reason, customer_id, created_at")
      .in("status", ["failed", "error"])
      .gte("created_at", since)
      .limit(100);
    for (const p of plans ?? []) {
      push("provision_failed", {
        dedupe_key: `provision_failed:${p.id}`,
        title: `Provisioning failed on ${p.provider}`,
        detail: p.rejected_reason || "The provisioning plan ended in a failed state.",
        customer_id: p.customer_id,
        entity_type: "provisioning_plans",
        entity_id: p.id,
      });
    }

    const { data: deployments } = await admin
      .from("cloud_deployments")
      .select("id, status, error, created_at, customer_id")
      .eq("status", "failed")
      .gte("created_at", since)
      .limit(100);
    for (const d of deployments ?? []) {
      push("provision_failed", {
        dedupe_key: `deployment_failed:${d.id}`,
        title: "Cloud deployment failed",
        detail: (d as any).error || "The deployment workflow reported a failure.",
        customer_id: d.customer_id,
        entity_type: "cloud_deployments",
        entity_id: d.id,
      });
    }
  }

  // ---- Automation / integration failures --------------------------------
  if (byMetric.has("automation_failed")) {
    const since = new Date(Date.now() - 2 * 864e5).toISOString();
    const { data: runs } = await admin
      .from("automation_runs")
      .select("id, rule, status, error, created_at")
      .neq("status", "ok")
      .gte("created_at", since)
      .limit(100);
    for (const r of runs ?? []) {
      if (!r.error && r.status === "success") continue;
      push("automation_failed", {
        dedupe_key: `automation_failed:${r.id}`,
        title: `Automation "${r.rule}" reported ${r.status}`,
        detail: r.error || "Scheduled job did not complete cleanly.",
        entity_type: "automation_runs",
        entity_id: r.id,
      });
    }
  }

  // ---- VoIP low balance --------------------------------------------------
  if (byMetric.has("balance")) {
    const fallback = thresholdOf("balance", 5);
    const { data: voip } = await admin
      .from("voip_accounts")
      .select("id, voip_number, balance_usd, low_balance_threshold_usd, customer_id, account_number, status")
      .is("archived_at", null);
    for (const v of voip ?? []) {
      const limit = Number(v.low_balance_threshold_usd ?? fallback);
      const bal = Number(v.balance_usd ?? 0);
      if (v.status === "active" && bal < limit) {
        push("balance", {
          dedupe_key: `voip_balance:${v.id}`,
          title: `VoIP ${v.voip_number} balance low`,
          detail: `Balance USD ${bal.toFixed(2)} is below the USD ${limit.toFixed(2)} threshold`,
          metric_value: bal,
          customer_id: v.customer_id,
          account_number: v.account_number,
          entity_type: "voip_accounts",
          entity_id: v.id,
        });
      }
    }
  }

  // ---- Reconcile against the currently open alert set --------------------
  const { data: openRows } = await admin
    .from("ops_alerts")
    .select("id, dedupe_key, status, occurrences")
    .neq("status", "resolved");
  const open = new Map((openRows ?? []).map((a: any) => [a.dedupe_key, a]));
  const nowIso = new Date().toISOString();

  let created = 0;
  let refreshed = 0;

  for (const a of raised) {
    const existing = open.get(a.dedupe_key) as any;
    if (existing) {
      await admin
        .from("ops_alerts")
        .update({ last_seen_at: nowIso, occurrences: (existing.occurrences ?? 1) + 1, metric_value: a.metric_value ?? null })
        .eq("id", existing.id);
      refreshed += 1;
    } else {
      const { data: inserted } = await admin
        .from("ops_alerts")
        .insert({ ...a, status: "open", first_seen_at: nowIso, last_seen_at: nowIso })
        .select("id")
        .maybeSingle();
      if (inserted?.id) {
        await admin.from("ops_alert_events").insert({
          alert_id: inserted.id,
          event_type: "raised",
          note: a.detail ?? null,
        });
        created += 1;
      }
    }
  }

  // Anything previously open whose condition cleared is auto-resolved.
  const stillFiring = new Set(raised.map((a) => a.dedupe_key));
  const stale = (openRows ?? []).filter((a: any) => !stillFiring.has(a.dedupe_key));
  for (const a of stale as any[]) {
    await admin
      .from("ops_alerts")
      .update({ status: "resolved", resolved_at: nowIso, resolution: "Condition cleared automatically" })
      .eq("id", a.id);
    await admin.from("ops_alert_events").insert({
      alert_id: a.id,
      event_type: "auto_resolved",
      note: "Underlying condition no longer detected",
    });
  }

  // Notify NOC / operations staff about brand new critical alerts.
  if (created > 0) {
    const { data: staff } = await admin
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["noc", "operations_manager", "master_admin"]);
    const ids = [...new Set((staff ?? []).map((s: any) => s.user_id))];
    const criticals = raised.filter((a) => a.severity === "critical" && !open.has(a.dedupe_key));
    if (ids.length && criticals.length) {
      await admin.from("notifications").insert(
        ids.flatMap((uid) =>
          criticals.slice(0, 5).map((a) => ({
            user_id: uid,
            kind: "ops_alert",
            title: `Critical alert · ${a.title}`,
            body: a.detail ?? null,
            link: "/alerts",
          })),
        ),
      );
    }
  }

  return { evaluated: raised.length, created, refreshed, auto_resolved: stale.length };
}
