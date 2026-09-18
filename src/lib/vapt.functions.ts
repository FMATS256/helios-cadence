import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScanProfile, Severity, VaptReport } from "./vapt.server";

const BLOCKED = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /\.internal$/i,
  /\.local$/i,
];

function guardTarget(raw: string) {
  const t = (raw ?? "").trim();
  if (!t) throw new Error("Enter a hostname, domain or URL to assess");
  const host = t.replace(/^\w+:\/\//, "").split("/")[0]!.split(":")[0]!.toLowerCase();
  if (BLOCKED.some((r) => r.test(host))) {
    throw new Error("Private, loopback and link-local addresses cannot be scanned from the platform edge");
  }
  return t;
}

/** Overall risk level of an assessment, derived from its worst findings and score. */
export function riskLevelOf(counts: Record<Severity, number>, score: number) {
  if ((counts.critical ?? 0) > 0) return "critical";
  if ((counts.high ?? 0) > 0) return "high";
  if ((counts.medium ?? 0) > 0 || score < 80) return "medium";
  if ((counts.low ?? 0) > 0) return "low";
  return "minimal";
}

const SEV_ORDER: Severity[] = ["critical", "high", "medium", "low", "info"];

/** Remediation windows by severity (days) used for the remediation plan. */
const SLA_DAYS: Record<Severity, number> = { critical: 3, high: 7, medium: 30, low: 90, info: 0 };

/**
 * Non-destructive vulnerability assessment (VAPT) against a customer-owned or
 * IMT-owned internet-facing asset. Staff-only, fully audited, and persisted so
 * the SOC workspace keeps the findings, risk level and remediation plan.
 */
export const runVaptScan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target: string; profile?: ScanProfile; account_number?: string | null; authorised?: boolean }) => d)
  .handler(async ({ data, context }) => {
    const { data: hasRole } = await (context.supabase as any).rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Staff role required");
    if (data.authorised !== true) throw new Error("Confirm you have written authorisation to test this target");

    const target = guardTarget(data.target);
    const profile: ScanProfile = data.profile ?? "standard";

    const { runAssessment } = await import("./vapt.server");
    const report: VaptReport = await runAssessment(target, profile);
    const actorEmail = (context as any).claims?.email ?? null;
    const riskLevel = riskLevelOf(report.counts, report.score);

    let assessmentId: string | null = null;
    let customerLabel: string | null = null;
    let accountNumber = (data.account_number ?? "").trim() || null;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { recordAudit, recordCustomerEvent } = await import("./customer-events.server");

      let customerId: string | null = null;
      if (accountNumber) {
        const { data: cust } = await supabaseAdmin
          .from("customers")
          .select("id, account_number, company_name")
          .eq("account_number", accountNumber)
          .maybeSingle();
        if (cust) {
          customerId = (cust as any).id;
          accountNumber = (cust as any).account_number;
          customerLabel = (cust as any).company_name || accountNumber;
        }
      }

      const { data: row, error } = await supabaseAdmin
        .from("security_assessments")
        .insert({
          target: report.target,
          profile,
          customer_id: customerId,
          account_number: accountNumber,
          score: report.score,
          grade: report.grade,
          risk_level: riskLevel,
          counts: report.counts as any,
          checks_run: report.checksRun,
          notes: report.notes,
          findings_total: report.findings.length,
          open_findings: report.findings.filter((f) => f.severity !== "info").length,
          duration_ms: report.durationMs,
          started_at: report.startedAt,
          finished_at: report.finishedAt,
          run_by: context.userId,
          run_by_email: actorEmail,
        })
        .select("id")
        .single();
      if (error) throw error;
      assessmentId = (row as any).id;

      if (report.findings.length) {
        await supabaseAdmin.from("security_assessment_findings").insert(
          report.findings.map((f) => ({
            assessment_id: assessmentId,
            finding_key: f.id,
            title: f.title,
            severity: f.severity,
            category: f.category,
            evidence: f.evidence,
            impact: f.impact,
            remediation: f.remediation,
            reference: f.reference ?? null,
            status: f.severity === "info" ? "acknowledged" : "open",
            due_date:
              SLA_DAYS[f.severity] > 0
                ? new Date(Date.now() + SLA_DAYS[f.severity] * 86_400_000).toISOString().slice(0, 10)
                : null,
          })) as any,
        );
      }

      if (customerId && accountNumber) {
        await recordCustomerEvent(supabaseAdmin, {
          customer_id: customerId,
          account_number: accountNumber,
          event_type: "security_assessment_completed",
          title: `Security assessment — ${report.target}`,
          description: `Risk ${riskLevel} · grade ${report.grade} (${report.score}/100) · ${report.findings.length} finding(s)`,
          module: "soc",
          entity_type: "security_assessment",
          entity_id: assessmentId,
          new_value: { target: report.target, score: report.score, grade: report.grade, counts: report.counts },
          major: riskLevel === "critical" || riskLevel === "high",
          actor_id: context.userId,
          actor_email: actorEmail,
        });
      } else {
        await recordAudit(supabaseAdmin, {
          actor_id: context.userId,
          actor_email: actorEmail,
          action: "vapt_scan",
          entity_type: "security_assessment",
          entity_id: assessmentId ?? report.target,
          account_number: null,
          module: "soc",
          new_value: { target: report.target, profile, score: report.score, grade: report.grade, counts: report.counts },
        });
      }
    } catch { /* persistence and auditing must never block the scan result */ }

    return { ...report, assessmentId, riskLevel, accountNumber, customerLabel };
  });

/** Assessment history for the SOC workspace, optionally scoped to one customer. */
export const listAssessments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d?: { account_number?: string | null; risk_level?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = (context.supabase as any)
      .from("security_assessments")
      .select("*, customers(account_number, company_name)")
      .order("started_at", { ascending: false })
      .limit(200);
    if (data?.account_number) q = q.eq("account_number", data.account_number);
    if (data?.risk_level && data.risk_level !== "all") q = q.eq("risk_level", data.risk_level);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as any[];
  });

/** One assessment plus its findings and remediation plan. */
export const getAssessment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: assessment, error } = await (context.supabase as any)
      .from("security_assessments")
      .select("*, customers(account_number, company_name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!assessment) throw new Error("Assessment not found");

    const { data: findings, error: fErr } = await (context.supabase as any)
      .from("security_assessment_findings")
      .select("*")
      .eq("assessment_id", data.id);
    if (fErr) throw new Error(fErr.message);

    const list = ((findings ?? []) as any[]).sort(
      (a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity),
    );

    return {
      assessment,
      findings: list,
      plan: {
        open: list.filter((f) => f.status === "open").length,
        in_progress: list.filter((f) => f.status === "in_progress").length,
        resolved: list.filter((f) => f.status === "resolved").length,
        accepted: list.filter((f) => f.status === "risk_accepted").length,
        overdue: list.filter(
          (f) => f.status !== "resolved" && f.status !== "risk_accepted" && f.due_date && f.due_date < new Date().toISOString().slice(0, 10),
        ).length,
      },
    };
  });

/** Move a finding through its remediation lifecycle. */
export const updateFinding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status?: string; resolution_note?: string | null; due_date?: string | null }) => {
    if (!d?.id) throw new Error("A finding is required");
    return d;
  })
  .handler(async ({ data, context }) => {
    const patch: Record<string, any> = {};
    if (data.status) patch.status = data.status;
    if (data.resolution_note !== undefined) patch.resolution_note = data.resolution_note;
    if (data.due_date !== undefined) patch.due_date = data.due_date;
    if (data.status === "resolved") {
      patch.resolved_at = new Date().toISOString();
      patch.owner_id = context.userId;
    }

    const { data: row, error } = await (context.supabase as any)
      .from("security_assessment_findings")
      .update(patch)
      .eq("id", data.id)
      .select("assessment_id")
      .single();
    if (error) throw new Error(error.message);

    const assessmentId = (row as any).assessment_id;
    const { data: open } = await (context.supabase as any)
      .from("security_assessment_findings")
      .select("id, severity, status")
      .eq("assessment_id", assessmentId);
    const openCount = ((open ?? []) as any[]).filter(
      (f) => f.severity !== "info" && f.status !== "resolved" && f.status !== "risk_accepted",
    ).length;
    await (context.supabase as any)
      .from("security_assessments")
      .update({ open_findings: openCount })
      .eq("id", assessmentId);

    return { ok: true, open_findings: openCount };
  });
