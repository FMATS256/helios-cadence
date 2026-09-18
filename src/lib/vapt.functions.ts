import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ScanProfile } from "./vapt.server";

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

/**
 * Non-destructive vulnerability assessment (VAPT) against a customer-owned or
 * IMT-owned internet-facing asset. Staff-only, fully audited.
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
    const report = await runAssessment(target, profile);

    try {
      const { recordAudit } = await import("./customer-events.server");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await recordAudit(supabaseAdmin, {
        actor_id: context.userId,
        actor_email: (context as any).claims?.email ?? null,
        action: "vapt_scan",
        entity_type: "security_assessment",
        entity_id: report.target,
        account_number: data.account_number ?? null,
        module: "soc",
        new_value: {
          target: report.target,
          profile,
          score: report.score,
          grade: report.grade,
          counts: report.counts,
        },
      });
    } catch { /* auditing must never block the scan result */ }

    return report;
  });
