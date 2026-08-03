import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id?: string | null;
    name: string;
    credential_type: string;
    username?: string;
    url?: string;
    notes?: string;
    secret: string;
    expires_at?: string | null;
    tags?: string[];
    linked_asset?: string | null;
  }) => input)
  .handler(async ({ data, context }) => {
    const { encryptSecret } = await import("./encryption.server");
    const enc = encryptSecret(data.secret);
    const { data: row, error } = await context.supabase
      .from("credentials")
      .insert({
        customer_id: data.customer_id ?? null,
        name: data.name,
        credential_type: data.credential_type,
        username: data.username ?? null,
        url: data.url ?? null,
        notes: data.notes ?? null,
        ciphertext: enc.ciphertext,
        iv: enc.iv,
        auth_tag: enc.authTag,
        key_id: enc.keyId,
        expires_at: data.expires_at ?? null,
        owner_id: context.userId,
        linked_asset: data.linked_asset ?? null,
        tags: data.tags ?? [],
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    id: string;
    name?: string;
    credential_type?: string;
    username?: string;
    url?: string;
    notes?: string;
    secret?: string;
    expires_at?: string | null;
    tags?: string[];
  }) => input)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.credential_type !== undefined) patch.credential_type = data.credential_type;
    if (data.username !== undefined) patch.username = data.username;
    if (data.url !== undefined) patch.url = data.url;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.expires_at !== undefined) patch.expires_at = data.expires_at;
    if (data.tags !== undefined) patch.tags = data.tags;

    if (data.secret) {
      // archive current version first
      const { data: current } = await context.supabase
        .from("credentials").select("ciphertext,iv,auth_tag,key_id").eq("id", data.id).single();
      if (current) {
        await context.supabase.from("credential_versions").insert({
          credential_id: data.id,
          ciphertext: current.ciphertext,
          iv: current.iv,
          auth_tag: current.auth_tag,
          key_id: current.key_id,
          changed_by: context.userId,
        });
      }
      const { encryptSecret } = await import("./encryption.server");
      const enc = encryptSecret(data.secret);
      patch.ciphertext = enc.ciphertext;
      patch.iv = enc.iv;
      patch.auth_tag = enc.authTag;
      patch.key_id = enc.keyId;
    }

    const { error } = await context.supabase.from("credentials").update(patch as any).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const VAULT_ROLES = ["master_admin", "operations_manager", "cloud_engineer", "technical_support", "cyber_security"];

export const revealCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    // Block 5: secret material is role-gated server-side and every reveal is audited.
    const { data: roleRows } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roles = (roleRows ?? []).map((r: any) => String(r.role));
    if (!roles.some((r) => VAULT_ROLES.includes(r))) {
      throw new Error("You do not have permission to reveal credentials.");
    }

    const { data: row, error } = await context.supabase
      .from("credentials")
      .select("id,name,customer_id,account_number,ciphertext,iv,auth_tag")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message || "Not found");

    await context.supabase.from("credential_access_log").insert({
      credential_id: data.id,
      accessed_by: context.userId,
      action: "reveal",
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { recordAudit } = await import("./customer-events.server");
    await recordAudit(supabaseAdmin, {
      actor_id: context.userId,
      actor_email: context.claims?.email ?? null,
      action: "credential_revealed",
      entity_type: "credential",
      entity_id: row.id,
      account_number: (row as any).account_number ?? null,
      module: "credentials",
      new_value: { name: (row as any).name, customer_id: (row as any).customer_id ?? null },
    });


    const { decryptSecret } = await import("./encryption.server");
    return { secret: decryptSecret({ ciphertext: row.ciphertext, iv: row.iv, authTag: row.auth_tag }) };
  });

export const deleteCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("credentials").update({ archived_at: new Date().toISOString() }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
