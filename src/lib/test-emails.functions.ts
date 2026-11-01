import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendTemplateEmail } from "./email-templates/send-email";
import { TEMPLATES } from "./email-templates/registry";

export const sendAllTestEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "master_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");
    const { assertOwnAddress } = await import("./recipient-guard.server");
    await assertOwnAddress(context as any, data.to);

    const results: Array<{ template: string; ok: boolean; reason?: string }> = [];
    for (const [name, tpl] of Object.entries(TEMPLATES)) {
      try {
        const res = await sendTemplateEmail(name, data.to, {
          templateData: tpl.previewData ?? {},
          idempotencyKey: `test-${name}-${Date.now()}`,
        });
        results.push({ template: name, ok: res.sent, reason: res.sent ? undefined : res.reason });
        // small delay to keep order in inbox
        await new Promise((r) => setTimeout(r, 800));
      } catch (e: any) {
        results.push({ template: name, ok: false, reason: e?.message ?? String(e) });
      }
    }
    return { results };
  });
