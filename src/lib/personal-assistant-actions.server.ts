// Personal assistant actions: proposals only run after the owner approves (in the app or via an emailed link).
// Client mail goes from the client-facing mailbox; reports to the owner come from the assistant mailbox.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const CLIENT_MAILBOX = "ammara.sithole@imtsolutions.co.zw";
export const ASSISTANT_MAILBOX = "assistant@imtsolutions.co.zw";
export const APP_URL = "https://management.imtsolutions.co.zw";

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin as any;
}

export async function proposeAction(userId: string, taskId: string | null, kind: "email" | "quotation" | "follow_up", title: string, payload: Record<string, unknown>) {
  const db = await admin();
  const { data, error } = await db.from("personal_assistant_actions").insert({ user_id: userId, task_id: taskId, kind, title: title.slice(0, 200), payload }).select("id").single();
  if (error) return { error: error.message };
  return { proposed: true, id: data.id, note: "Waiting for your user's approval; nothing has been sent." };
}

/** Runs one approved action. The pending→processing claim makes repeat approvals harmless. */
export async function executeAssistantAction(match: { id?: string; token?: string; userId?: string }) {
  const db = await admin();
  let q = db.from("personal_assistant_actions").update({ status: "processing", decided_at: new Date().toISOString() }).eq("status", "pending");
  if (match.id) q = q.eq("id", match.id);
  if (match.token) q = q.eq("approval_token", match.token);
  if (match.userId) q = q.eq("user_id", match.userId);
  const { data: action } = await q.select("*").maybeSingle();
  if (!action) return { ok: false as const, error: "This action was already handled or does not exist." };
  try {
    const p = action.payload ?? {};
    let result = "";
    if (action.kind === "quotation") {
      const lines = (p.lines ?? []).filter((l: any) => String(l.description ?? "").trim());
      if (!p.customer_id || !lines.length) throw new Error("Quotation needs a client and at least one line");
      const { data: cust } = await db.from("customers").select("id,account_number").eq("id", p.customer_id).maybeSingle();
      if (!cust) throw new Error("Client not found");
      const year = new Date().getFullYear();
      const { data: last } = await db.from("quotes").select("quote_number").like("quote_number", `QT-${year}-%`).order("quote_number", { ascending: false }).limit(1);
      const quoteNumber = `QT-${year}-${String(Number(String(last?.[0]?.quote_number ?? "").split("-").pop() ?? 0) + 1).padStart(4, "0")}`;
      const total = lines.reduce((s: number, l: any) => s + Number(l.quantity || 1) * Number(l.unit_price || 0), 0);
      const { data: quote, error } = await db.from("quotes").insert({
        customer_id: cust.id, account_number: cust.account_number, title: String(p.title || action.title), currency: String(p.currency || "USD").toUpperCase(),
        amount: Number(total.toFixed(2)), notes: p.notes || null, quote_number: quoteNumber, status: "draft", created_by: action.user_id,
      }).select("id").single();
      if (error) throw new Error(error.message);
      const { error: le } = await db.from("quote_line_items").insert(lines.map((l: any, i: number) => ({
        quote_id: quote.id, description: String(l.description).trim(), quantity: Number(l.quantity || 1), unit_price: Number(l.unit_price || 0), tax_rate: 0, position: i,
      })));
      if (le) throw new Error(le.message);
      result = `Draft quotation ${quoteNumber} created (${String(p.currency || "USD").toUpperCase()} ${total.toFixed(2)}). Review and send it from Quotes.`;
    } else {
      const { data: am } = await db.from("profiles").select("id,full_name").eq("email", CLIENT_MAILBOX).maybeSingle();
      if (!am) throw new Error("Client mailbox owner not found");
      const { createAndSendEnquiryEmail } = await import("./inbox.server");
      const sent = await createAndSendEnquiryEmail({
        senderId: am.id, senderName: am.full_name || "Ammara Sithole", senderRole: "Account Manager", senderEmail: CLIENT_MAILBOX, mailbox: CLIENT_MAILBOX,
        to: String(p.to ?? ""), subject: String(p.subject ?? action.title), body: String(p.body ?? ""), customerId: (p.customer_id as string) || null, originalSubject: true,
      });
      if (!sent.ok) throw new Error(sent.error);
      result = `Sent to ${p.to} from ${CLIENT_MAILBOX}.`;
    }
    await db.from("personal_assistant_actions").update({ status: "done", result }).eq("id", action.id);
    return { ok: true as const, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : "Action failed";
    await db.from("personal_assistant_actions").update({ status: "failed", error }).eq("id", action.id);
    return { ok: false as const, error };
  }
}

export async function rejectByToken(token: string) {
  const db = await admin();
  const { data } = await db.from("personal_assistant_actions").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("approval_token", token).eq("status", "pending").select("id").maybeSingle();
  return !!data;
}

const harareDay = (d = new Date()) => new Date(d.getTime() + 2 * 3600000).toISOString().slice(0, 10);

export async function buildDailyReport(userId: string, now = new Date()) {
  const db = await admin();
  const day = harareDay(now);
  const start = new Date(`${day}T00:00:00+02:00`).toISOString();
  const { data: me } = await db.from("profiles").select("full_name,work_email,email").eq("id", userId).maybeSingle();
  const mailboxes = [CLIENT_MAILBOX, me?.work_email, me?.email].filter(Boolean).map((m: string) => m.toLowerCase());
  const [actions, tasks, pending, sentMsgs, tickets] = await Promise.all([
    db.from("personal_assistant_actions").select("kind,title,status,result,error").eq("user_id", userId).gte("decided_at", start),
    db.from("personal_assistant_tasks").select("title,status").eq("user_id", userId).gte("created_at", start),
    db.from("personal_assistant_actions").select("title,kind,approval_token,payload").eq("user_id", userId).eq("status", "pending").order("created_at").limit(20),
    db.from("email_messages").select("from_address,to_address,subject,delivery_status").eq("direction", "outbound").gte("created_at", start).limit(500),
    db.from("tickets").select("ticket_number,subject,priority,sla_due_at").eq("assigned_to", userId).is("archived_at", null).not("status", "in", "(resolved,closed)").order("sla_due_at", { ascending: true, nullsFirst: false }).limit(10),
  ]);
  const mine = (sentMsgs.data ?? []).filter((m: any) => mailboxes.some((b) => String(m.from_address ?? "").toLowerCase().includes(b)));
  const failed = mine.filter((m: any) => /fail|bounce|reject/i.test(String(m.delivery_status ?? ""))).length;
  const rate = mine.length ? Math.round(((mine.length - failed) / mine.length) * 100) : 100;
  return { day, name: me?.full_name ?? "Sir", actions: actions.data ?? [], tasks: tasks.data ?? [], pending: pending.data ?? [], emails: mine, failed, rate, tickets: tickets.data ?? [] };
}

export async function renderDailyReportPdf(r: Awaited<ReturnType<typeof buildDailyReport>>) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.16, 0.33), ink = rgb(0.14, 0.17, 0.21), line = rgb(0.8, 0.83, 0.87);
  const safe = (s: string) => String(s ?? "").replace(/[—–]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7e]/g, "");
  let page = doc.addPage([595.28, 841.89]); let y = 800;
  const write = (t: string, size = 10, b = false, x = 40) => {
    if (y < 50) { page = doc.addPage([595.28, 841.89]); y = 800; }
    page.drawText(safe(t).slice(0, 105), { x, y, size, font: b ? bold : font, color: b ? navy : ink }); y -= size + 6;
  };
  const section = (t: string) => { y -= 6; write(t, 12, true); page.drawLine({ start: { x: 40, y: y + 12 }, end: { x: 555, y: y + 12 }, thickness: 0.6, color: line }); };
  page.drawRectangle({ x: 0, y: 790, width: 595.28, height: 52, color: navy });
  page.drawText("IMT Solutions - Daily Assistant Report", { x: 40, y: 812, size: 16, font: bold, color: rgb(1, 1, 1) });
  page.drawText(safe(r.day), { x: 40, y: 797, size: 10, font, color: rgb(1, 1, 1) }); y = 765;
  write("Good evening Sir,", 11, false);
  write(`Here is my report for today. ${r.actions.length} action(s) handled, ${r.pending.length} awaiting your approval.`);
  section("Email delivery");
  write(`Emails sent: ${r.emails.length}   Failed: ${r.failed}   Delivery rate: ${r.rate}%`);
  for (const m of r.emails.slice(0, 25)) write(`- ${m.subject ?? "(no subject)"} -> ${m.to_address ?? ""} [${m.delivery_status ?? "sent"}]`, 9);
  section("Actions completed today");
  if (!r.actions.length) write("None today, Sir.", 9);
  for (const a of r.actions) write(`- [${a.status}] ${a.kind}: ${a.title}${a.result ? ` - ${a.result}` : a.error ? ` - ${a.error}` : ""}`, 9);
  section("Awaiting your approval");
  if (!r.pending.length) write("Nothing pending, Sir.", 9);
  for (const a of r.pending) write(`- ${a.kind}: ${a.title}`, 9);
  section("Tasks you assigned today");
  if (!r.tasks.length) write("None.", 9);
  for (const t of r.tasks) write(`- [${t.status}] ${t.title}`, 9);
  section("Your schedule - open tickets by due time");
  if (!r.tickets.length) write("No open tickets assigned to you.", 9);
  for (const t of r.tickets) write(`- ${t.ticket_number} ${t.subject} (${t.priority ?? ""}) due ${t.sla_due_at ? new Date(t.sla_due_at).toLocaleString("en-GB", { timeZone: "Africa/Harare" }) : "-"}`, 9);
  return doc.save();
}

/** Sends the PDF report plus approve/reject links. One report per user per day. */
export async function sendDailyReport(userId: string, to: string, force = false) {
  const db = await admin();
  const r = await buildDailyReport(userId);
  if (!force) {
    const claim = await db.from("personal_assistant_reports").insert({ user_id: userId, report_date: r.day }).select("id").single();
    if (claim.error?.code === "23505") return { skipped: true };
    if (claim.error) throw new Error(claim.error.message);
  }
  const pdf = await renderDailyReportPdf(r);
  const links = r.pending.map((a: any) => `<li>${esc(a.title)} — <a href="${APP_URL}/api/public/assistant/approve?token=${a.approval_token}">Review &amp; approve</a></li>`).join("");
  const html = `<p>Good evening Sir,</p><p>Your daily report for ${r.day} is attached. Emails sent: ${r.emails.length}, delivery rate ${r.rate}%.</p>${links ? `<p>Awaiting your approval:</p><ul>${links}</ul>` : "<p>Nothing is awaiting your approval, Sir.</p>"}<p>Your Personal Assistant</p>`;
  const { sendInboxEmail } = await import("./inbox.server");
  const res = await sendInboxEmail({
    from: `Personal Assistant <${ASSISTANT_MAILBOX}>`, to, subject: `Daily report ${r.day}`, html,
    text: `Good evening Sir,\n\nYour daily report for ${r.day} is attached. Emails sent: ${r.emails.length}, delivery rate ${r.rate}%.\nPending approvals: ${r.pending.length}. Approve them in the app under Personal Assistant.`,
    attachments: [{ filename: `daily-report-${r.day}.pdf`, content: pdf, contentType: "application/pdf" }],
  });
  if (!force) await db.from("personal_assistant_reports").update(res.ok ? { status: "sent", message_id: res.id } : { status: "failed", error: res.error }).eq("user_id", userId).eq("report_date", r.day);
  if (!res.ok) throw new Error(res.error);
  return { sent: true, id: res.id };
}

export async function sendAllDailyReports() {
  const db = await admin();
  const { data } = await db.from("personal_assistant_settings").select("user_id,report_email").eq("daily_report_enabled", true);
  let sent = 0, failed = 0;
  for (const s of data ?? []) {
    if (!s.report_email) continue;
    try { const r = await sendDailyReport(s.user_id, s.report_email); if (r.sent) sent++; } catch { failed++; }
  }
  return { sent, failed };
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

/**
 * Answers a question emailed to the assistant mailbox. Only master admins with an assistant can use it.
 * The answer always goes to the owner's saved address (never the From header), so a forged sender learns nothing.
 * Each inbound message is claimed once by provider id, so gateway re-sends never produce a second reply.
 */
export async function handleAssistantEmail(input: { providerId: string; fromEmail: string; subject: string; text: string }) {
  const db = await admin();
  const from = input.fromEmail.toLowerCase();
  const { data: settingsRows } = await db.from("personal_assistant_settings").select("user_id,assistant_name,persona,enabled_roles,report_email");
  let owner: any = null;
  for (const s of settingsRows ?? []) {
    const { data: p } = await db.from("profiles").select("email,work_email").eq("id", s.user_id).maybeSingle();
    const addrs = [s.report_email, p?.email, p?.work_email].filter(Boolean).map((a: string) => a.toLowerCase());
    if (addrs.includes(from)) { owner = { ...s, replyTo: s.report_email || p?.email }; break; }
  }
  if (!owner) return { handled: false };
  const { data: role } = await db.from("user_roles").select("role").eq("user_id", owner.user_id).eq("role", "master_admin").maybeSingle();
  if (!role) return { handled: false };
  const claim = await db.from("personal_assistant_email_requests").insert({ user_id: owner.user_id, provider_id: input.providerId, subject: input.subject.slice(0, 300) }).select("id").single();
  if (claim.error?.code === "23505") return { handled: true, duplicate: true };
  if (claim.error) throw new Error(claim.error.message);
  const question = input.text.split(/\n>|\nOn .+wrote:/)[0].slice(0, 4000);
  try {
    const { runPersonalAssistant } = await import("./personal-assistant.server");
    const { allowedAssistantRoles } = await import("./personal-assistant.shared");
    const roles = allowedAssistantRoles(owner.enabled_roles ?? [], "any");
    const answer = await runPersonalAssistant(db, owner.user_id, owner, roles.length ? roles : (owner.enabled_roles as any), `Question emailed by Sir (subject: ${input.subject}):\n${question}\n\nAnswer using the system records.`);
    const html = answer.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`).join("");
    const { sendInboxEmail } = await import("./inbox.server");
    const res = await sendInboxEmail({ from: `${owner.assistant_name || "Personal Assistant"} <${ASSISTANT_MAILBOX}>`, to: owner.replyTo, subject: `Re: ${input.subject}`.slice(0, 300), html, text: answer });
    await db.from("personal_assistant_email_requests").update(res.ok ? { status: "answered", reply_id: res.id } : { status: "failed", error: res.error }).eq("id", claim.data.id);
  } catch (e: any) {
    await db.from("personal_assistant_email_requests").update({ status: "failed", error: String(e?.message ?? e).slice(0, 500) }).eq("id", claim.data.id);
  }
  return { handled: true };
}
