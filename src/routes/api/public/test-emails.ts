import { createFileRoute } from "@tanstack/react-router";
import { renderTemplateHtml } from "@/lib/email-templates/render.server";
import { TEMPLATES } from "@/lib/email-templates/registry";
import { adminClient, sendInboxEmail } from "@/lib/inbox.server";

// Test-only endpoint: sends every registered template to a fixed recipient.
// Locked to fmats256@gmail.com so this cannot be used to spam other addresses.
const ALLOWED_RECIPIENT = "fmats256@gmail.com";

export const Route = createFileRoute("/api/public/test-emails")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestedTemplate = new URL(request.url).searchParams.get("template");
        if (requestedTemplate === "welcome-boss") {
          const { imtSignature } = await import("@/lib/email-signature.shared");
          const body = `<div style="font-family:Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:#202124"><p>Dear Farai,</p><p>Welcome, our boss Farai Matare! We are delighted to have you leading IMT Solutions and look forward to achieving great things together.</p></div>`;
          const html = `${body}<br/>${imtSignature({ name: "Farai Matare", role: "admin", email: "farai.matare@imtsolutions.co.zw" })}`;
          const res = await sendInboxEmail({
            from: "Farai Matare <farai.matare@imtsolutions.co.zw>",
            to: ALLOWED_RECIPIENT,
            subject: "Welcome our boss Farai Matare",
            html,
            text: "Dear Farai,\n\nWelcome, our boss Farai Matare! We are delighted to have you leading IMT Solutions and look forward to achieving great things together.\n\nKind regards,\nFarai Matare",
            replyTo: "sales@imtsolutions.co.zw",
          });
          return Response.json({ recipient: ALLOWED_RECIPIENT, ok: res.ok, reason: res.ok ? undefined : res.error });
        }
        if (requestedTemplate && !TEMPLATES[requestedTemplate]) {
          return Response.json({ error: "Unknown email template" }, { status: 400 });
        }
        const templates = requestedTemplate
          ? [[requestedTemplate, TEMPLATES[requestedTemplate]]] as const
          : Object.entries(TEMPLATES);
        const results: Array<{ template: string; ok: boolean; reason?: string }> = [];
        for (const [name, tpl] of templates) {
          try {
            const rendered = await renderTemplateHtml({
              templateName: name,
              sampleDataOverride: tpl.previewData ?? {},
              supabase: adminClient(),
            });
            const res = await sendInboxEmail({
              from: "sales@imtsolutions.co.zw",
              to: ALLOWED_RECIPIENT,
              subject: rendered.subject,
              html: rendered.html,
              text: rendered.text,
              replyTo: "sales@imtsolutions.co.zw",
            });
            results.push({
              template: name,
              ok: res.ok,
              reason: res.ok ? undefined : res.error,
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
