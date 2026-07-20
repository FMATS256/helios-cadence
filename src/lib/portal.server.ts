// Server-only helpers for the Cloud Portal. Never import from browser code.
import type { SupabaseClient } from "@supabase/supabase-js";

function slugify(s: string): string {
  return (s || "workspace")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "workspace";
}

function randomKey(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-ish
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet.charAt(b % alphabet.length)).join("");
}

/** Ensures a workspace exists for the customer. Idempotent. */
export async function ensureWorkspace(admin: SupabaseClient<any>, customerId: string) {
  const existing = await admin
    .from("cloud_workspaces")
    .select("*")
    .eq("customer_id", customerId)
    .maybeSingle();
  if (existing.data) return existing.data as any;

  const { data: cust, error: cErr } = await admin
    .from("customers")
    .select("id, company_name, account_number, primary_email")
    .eq("id", customerId)
    .single();
  if (cErr || !cust) throw new Error("Customer not found");

  const slug = slugify(cust.company_name || cust.account_number || "customer");
  for (let i = 0; i < 5; i++) {
    const key = randomKey(6);
    const { data, error } = await admin
      .from("cloud_workspaces")
      .insert({
        customer_id: customerId,
        slug,
        workspace_key: key,
        name: cust.company_name || cust.account_number,
      })
      .select("*")
      .single();
    if (!error && data) return data as any;
    if (error && !String(error.message).includes("duplicate")) throw error;
  }
  throw new Error("Failed to allocate workspace key");
}

/** Links a provisioned server to the customer's workspace and creates one if missing. */
export async function linkServerToCustomerWorkspace(
  admin: SupabaseClient<any>,
  serverId: string,
  customerId: string | null | undefined,
) {
  if (!customerId) return null;
  const ws = await ensureWorkspace(admin, customerId);
  await admin
    .from("workspace_servers")
    .upsert({ workspace_id: ws.id, server_id: serverId }, { onConflict: "server_id" });
  await admin.from("workspace_audit_log").insert({
    workspace_id: ws.id,
    actor_kind: "system",
    action: "server_provisioned",
    resource_kind: "server",
    resource_id: serverId,
  });
  return ws;
}
