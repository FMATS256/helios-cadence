import { createFileRoute } from "@tanstack/react-router";
import { sendTemplateEmail } from "@/lib/email-templates/send-email";
import { TEMPLATES } from "@/lib/email-templates/registry";

// Test-only endpoint: sends every registered template to a fixed recipient.
// Locked to fmats256@gmail.com so this cannot be used to spam other addresses.
const ALLOWED_RECIPIENT = "fmats256@gmail.com";

export const Route = createFileRoute("/api/public/test-emails")({
  server: {
    handlers: {
      GET: async () => {
        const results: Array<{ template: string; ok: boolean; reason?: string }> = [];
        for (const [name, tpl] of Object.entries(TEMPLATES)) {
          try {
            const res = await sendTemplateEmail(name, ALLOWED_RECIPIENT, {
              templateData: tpl.previewData ?? {},
              idempotencyKey: `test-${name}-${Date.now()}`,
            });
            results.push({
              template: name,
              ok: res.sent,
              reason: res.sent ? undefined : res.reason,
            });
            await new Promise((r) => setTimeout(r, 900));
          } catch (e: any) {
            results.push({ template: name, ok: false, reason: e?.message ?? String(e) });
          }
        }
        return Response.json({ recipient: ALLOWED_RECIPIENT, results });
      },
    },
  },
});
