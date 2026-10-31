import { createFileRoute } from "@tanstack/react-router";

// Emailed approval link. GET only shows a confirmation page (mail scanners open links);
// the action runs on the POST from that page. The random token is the capability.
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const page = (body: string) => new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistant approval</title><body style="font-family:Arial,sans-serif;max-width:560px;margin:40px auto;padding:0 16px;color:#1f2937">${body}</body>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
const valid = (t: string | null) => !!t && /^[0-9a-f-]{36}$/i.test(t);

export const Route = createFileRoute("/api/public/assistant/approve")({
  server: { handlers: {
    GET: async ({ request }) => {
      const token = new URL(request.url).searchParams.get("token");
      if (!valid(token)) return page("<p>Invalid link.</p>");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: a } = await (supabaseAdmin as any).from("personal_assistant_actions").select("kind,title,status,payload").eq("approval_token", token).maybeSingle();
      if (!a) return page("<p>Invalid link.</p>");
      if (a.status !== "pending") return page(`<p>This was already handled, Sir (${esc(a.status)}).</p>`);
      const p = a.payload ?? {};
      const detail = a.kind === "quotation"
        ? `<ul>${(p.lines ?? []).map((l: any) => `<li>${esc(l.description)} × ${esc(l.quantity)} @ ${esc(l.unit_price)}</li>`).join("")}</ul>`
        : `<p><b>To:</b> ${esc(p.to)}<br><b>Subject:</b> ${esc(p.subject)}</p><pre style="white-space:pre-wrap;background:#f3f4f6;padding:12px">${esc(p.body)}</pre>`;
      return page(`<h2>${esc(a.title)}</h2><p>${esc(a.kind)}</p>${detail}<form method="post"><input type="hidden" name="token" value="${esc(token!)}"><button name="decision" value="approve" style="padding:10px 18px;background:#0f2a54;color:#fff;border:0">Approve</button> <button name="decision" value="reject" style="padding:10px 18px">Reject</button></form>`);
    },
    POST: async ({ request }) => {
      const form = await request.formData();
      const token = String(form.get("token") ?? "");
      if (!valid(token)) return page("<p>Invalid link.</p>");
      const m = await import("@/lib/personal-assistant-actions.server");
      if (form.get("decision") === "reject") return page((await m.rejectByToken(token)) ? "<p>Rejected, Sir. Nothing was sent.</p>" : "<p>Already handled.</p>");
      const r = await m.executeAssistantAction({ token });
      return page(r.ok ? `<p>Done, Sir. ${esc(r.result)}</p>` : `<p>Could not complete: ${esc(r.error)}</p>`);
    },
  } },
});
