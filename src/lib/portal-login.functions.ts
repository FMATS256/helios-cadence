import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { classifyIdentifier } from "./portal-login.shared";

const GENERIC = "Unable to sign in. Check your details and password.";

/** Public: resolves email / username / account number server-side so emails are never exposed. */
export const clientSignIn = createServerFn({ method: "POST" })
  .inputValidator((v) => z.object({ identifier: z.string().max(200), password: z.string().min(1).max(200) }).parse(v))
  .handler(async ({ data }) => {
    const id = classifyIdentifier(data.identifier);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let email: string | null = id.kind === "email" ? id.value : null;
    if (id.kind === "username") {
      const { data: p } = await supabaseAdmin.from("profiles").select("email").ilike("username", id.value).not("customer_id", "is", null).maybeSingle();
      email = p?.email ?? null;
    } else if (id.kind === "account") {
      const { data: c } = await supabaseAdmin.from("customers").select("id,primary_email").eq("account_number", id.value).is("archived_at", null).maybeSingle();
      if (c) {
        const { data: users } = await supabaseAdmin.from("profiles").select("email").eq("customer_id", c.id);
        const list = users ?? [];
        email = (list.find((u) => u.email?.toLowerCase() === c.primary_email?.toLowerCase()) ?? (list.length === 1 ? list[0] : null))?.email ?? null;
      }
    }
    if (!email) return { error: GENERIC };
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => { const h = new Headers(init?.headers); if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); } },
    });
    const { data: auth, error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error || !auth.session) return { error: GENERIC };
    return { access_token: auth.session.access_token, refresh_token: auth.session.refresh_token };
  });

export const listPortalAnnouncements = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data, error } = await context.supabase.from("portal_announcements").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("Announcements unavailable");
  return data ?? [];
});

const announcement = z.object({
  id: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(300),
  link_url: z.string().trim().url().startsWith("https://").nullable().optional(),
  link_label: z.string().trim().max(40).nullable().optional(),
  tone: z.enum(["info", "promo", "warning"]),
  active: z.boolean(),
  ends_at: z.string().nullable().optional(),
});

export const savePortalAnnouncement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => announcement.parse(v)).handler(async ({ data, context }) => {
  const { id, ...row } = data;
  const q = id ? context.supabase.from("portal_announcements").update(row).eq("id", id) : context.supabase.from("portal_announcements").insert({ ...row, created_by: context.userId });
  const { error } = await q;
  if (error) throw new Error("Only administrators can manage portal banners");
  return { ok: true };
});

export const deletePortalAnnouncement = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((v) => z.object({ id: z.string().uuid() }).parse(v)).handler(async ({ data, context }) => {
  const { error } = await context.supabase.from("portal_announcements").delete().eq("id", data.id);
  if (error) throw new Error("Only administrators can manage portal banners");
  return { ok: true };
});
