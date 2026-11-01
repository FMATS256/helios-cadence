import { denyUnlessInternal } from "@/lib/hook-auth.server";
import { createFileRoute } from "@tanstack/react-router";

// Automation tick — runs every enabled automation rule (renewal reminders,
// invoice reminders, overdue escalation, auto-suspend, monitoring + SLA alerts
// and the scheduled operations digest). Safe to call hourly: every rule is
// idempotent within a day.
async function tick(request: Request) {
  const url = new URL(request.url);
  const rule = url.searchParams.get("rule");
  const { runAutomation } = await import("@/lib/automation.server");
  const result = await runAutomation({
    rules: rule ? ([rule] as any) : undefined,
    trigger: "cron",
  });
  return new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });
}

export const Route = createFileRoute("/api/public/hooks/automation-tick")({
  server: {
    handlers: {
      GET: async ({ request }) => denyUnlessInternal(request) ?? tick(request),
      POST: async ({ request }) => denyUnlessInternal(request) ?? tick(request),
    },
  },
});
