import { test, expect } from "bun:test";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

// Explicit opt-in: creates a temporary account for live API/notification checks.
test.skipIf(!process.env.RUN_ACCOUNT_OPENING_INTEGRATION)("email API opens an account and original API replays without another account", async () => {
  const key = process.env.IMT_EMAIL_API_KEY;
  if (!key) throw new Error("Website signing key is required");
  const raw = JSON.stringify({ external_id: "manager-alert-verification-20261018", category: "personal", name: "Temporary manager alert verification", contact_name: "Verification", email: "verification@example.com", phone: "+26312345678" });
  const headers = { "Content-Type": "application/json", "X-IMT-Signature": "sha256=" + createHmac("sha256", key).update(raw).digest("hex") };
  const first = await fetch("http://localhost:8080/api/public/email/accounts/open", { method: "POST", headers, body: raw });
  expect(first.status).toBe(201);
  const opened = await first.json();
  expect(opened.account_number).toMatch(/^M\d+$/);
  expect(opened.account_manager.email).toContain("@");
  const retry = await fetch("http://localhost:8080/api/public/accounts/open", { method: "POST", headers, body: raw });
  expect(retry.status).toBe(200);
  const replayed = await retry.json();
  expect(replayed.replayed).toBe(true);
  expect(replayed.account_number).toBe(opened.account_number);
  const alerts = JSON.parse(execFileSync("lovable", ["supabase", "query", `select count(*)::int as alerts from notifications n join customers c on n.user_id=c.account_manager_id and n.link='/customers/'||c.account_number where n.kind='account_assigned' and c.account_number='${opened.account_number}'`], { encoding: "utf8" }));
  expect(alerts[0].alerts).toBe(1);
  const unsigned = await fetch("http://localhost:8080/api/public/email/accounts/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
  expect(unsigned.status).toBe(401);
}, 30000);

test.skipIf(!process.env.WELCOME_VERIFICATION_ACCOUNT)("welcome is saved once with the assigned sender, account and personalized signature", () => {
  const account = process.env.WELCOME_VERIFICATION_ACCOUNT;
  if (!account || !/^M\d+$/.test(account)) throw new Error("A verified account number is required");
  const rows = JSON.parse(execFileSync("lovable", ["supabase", "query", `select c.welcome_email_status,m.from_address=p.email as correct_sender,m.subject='Welcome to IMT Solutions — Account '||c.account_number as correct_subject,position(c.account_number in m.body_text)>0 as has_account,position(lower(p.full_name) in lower(split_part(m.body_html,'<!--imt-sig-->',2)))>0 as has_manager_signature,position('microsoft-365' in m.body_html)>0 as has_banner,(select count(*)::int from email_messages x join email_enquiries e on e.id=x.enquiry_id where e.customer_id=c.id and x.direction='outbound') as sent_count from customers c join profiles p on p.id=c.account_manager_id join email_messages m on m.id=c.welcome_email_message_id where c.account_number='${account}'`], { encoding: "utf8" }));
  expect(rows).toHaveLength(1);
  expect(rows[0].welcome_email_status).toBe("sent");
  expect(rows[0].correct_sender).toBe(true);
  expect(rows[0].correct_subject).toBe(true);
  expect(rows[0].has_account).toBe(true);
  expect(rows[0].has_manager_signature).toBe(true);
  expect(rows[0].has_banner).toBe(true);
  expect(rows[0].sent_count).toBe(1);
});