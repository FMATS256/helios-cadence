import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { storageSellPrice } from "./storage-pricing";

const ROLES = ["operations_manager", "cloud_engineer"];

async function vultr(path: string, init?: RequestInit) {
  const key = process.env["VULTR_API_KEY"];
  if (!key) throw new Error("Vultr is not connected");
  const res = await fetch(`https://api.vultr.com/v2${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Vultr storage error", res.status, text);
    throw new Error(`Vultr rejected the request (${res.status})`);
  }
  return text ? JSON.parse(text) : {};
}

export const listVultrStorageClusters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertRole } = await import("./hosting.server");
    await assertRole(context, ROLES);
    const j = await vultr("/object-storage/clusters");
    return (j.clusters ?? [])
      .filter((c: any) => c.deploy === "yes")
      .map((c: any) => ({ id: Number(c.id), region: String(c.region), hostname: String(c.hostname) }));
  });

export const provisionVultrStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { customer_id: string; name: string; size_gb: number; cluster_id: number }) => d)
  .handler(async ({ data, context }) => {
    const { assertRole, admin } = await import("./hosting.server");
    await assertRole(context, ROLES);
    if (!data.customer_id) throw new Error("Choose a client");
    if (!data.name?.trim()) throw new Error("Enter a name");
    const price = storageSellPrice(Number(data.size_gb));
    const db = await admin();

    const created = await vultr("/object-storage", {
      method: "POST",
      body: JSON.stringify({ cluster_id: Number(data.cluster_id), label: data.name.trim().slice(0, 60) }),
    });
    const os = created.object_storage ?? {};

    let credId: string | null = null;
    if (os.s3_secret_key) {
      const { encryptSecret } = await import("./encryption.server");
      const enc = encryptSecret(os.s3_secret_key);
      const { data: cred, error } = await db.from("credentials").insert({
        customer_id: data.customer_id,
        name: `Cloud Storage ${data.name.trim()} — S3 keys`,
        credential_type: "api_key",
        username: os.s3_access_key ?? null,
        url: os.s3_hostname ? `https://${os.s3_hostname}` : null,
        notes: `Vultr object storage ${os.id}. Username is the S3 access key; secret is the S3 secret key.`,
        ciphertext: enc.ciphertext, iv: enc.iv, auth_tag: enc.authTag, key_id: enc.keyId,
        tags: ["storage", "vultr", "s3"],
        created_by: context.userId, owner_id: context.userId,
      }).select("id").single();
      if (error) throw new Error(error.message);
      credId = cred?.id ?? null;
    }

    const renewal = new Date(); renewal.setMonth(renewal.getMonth() + 1);
    const { data: row, error } = await db.from("cloud_storage_accounts").insert({
      name: data.name.trim(),
      provider: "Vultr Object Storage",
      customer_id: data.customer_id,
      access_url: os.s3_hostname ? `https://${os.s3_hostname}` : null,
      storage_tb: Number(data.size_gb) / 1000,
      used_tb: 0,
      monthly_cost: price,
      currency: "USD",
      renewal_date: renewal.toISOString().slice(0, 10),
      status: os.status === "active" ? "active" : "pending",
      provisioning_status: "provisioned",
      notes: `Vultr ID ${os.id ?? "pending"}${credId ? ` · keys in Credential Vault` : ""}. Allocation ${data.size_gb} GB.`,
      created_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(`Storage was created at Vultr (${os.id}) but saving failed: ${error.message}`);
    return { id: row.id, vultr_id: os.id ?? null, price, hostname: os.s3_hostname ?? null };
  });
