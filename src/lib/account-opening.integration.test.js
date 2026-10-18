import { test, expect } from "bun:test";
import { createHmac } from "node:crypto";

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
  const unsigned = await fetch("http://localhost:8080/api/public/email/accounts/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: raw });
  expect(unsigned.status).toBe(401);
}, 30000);