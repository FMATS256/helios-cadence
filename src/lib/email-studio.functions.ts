import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: any) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "master_admin",
  });
  if (!isAdmin) throw new Error("Forbidden");
}

/** List all registered templates + their DB overrides. */
export const listEmailStudioTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { TEMPLATES } = await import("./email-templates/registry");
    const { data: overrides } = await (context.supabase as any)
      .from("email_templates")
      .select("*");
    const overrideMap = new Map<string, any>();
    (overrides ?? []).forEach((o: any) => overrideMap.set(o.template_name, o));

    return Object.entries(TEMPLATES).map(([name, entry]) => {
      const o = overrideMap.get(name);
      const subject =
        typeof entry.subject === "function"
          ? entry.subject(entry.previewData ?? {})
          : entry.subject;
      return {
        template_name: name,
        display_name: entry.displayName || name,
        default_subject: subject,
        preview_data: entry.previewData ?? {},
        override: o
          ? {
              id: o.id,
              subject: o.subject,
              preview_text: o.preview_text,
              from_name: o.from_name,
              mode: o.mode,
              sample_data: o.sample_data,
              is_active: o.is_active,
              updated_at: o.updated_at,
            }
          : null,
      };
    });
  });

/** Get full template row (with unlayer_design + html_content). */
export const getEmailStudioTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { TEMPLATES } = await import("./email-templates/registry");
    const entry = TEMPLATES[data.templateName];
    if (!entry) throw new Error("Template not found");
    const { data: row } = await (context.supabase as any)
      .from("email_templates")
      .select("*")
      .eq("template_name", data.templateName)
      .maybeSingle();
    const defaultSubject =
      typeof entry.subject === "function"
        ? entry.subject(entry.previewData ?? {})
        : entry.subject;
    return {
      template_name: data.templateName,
      display_name: entry.displayName || data.templateName,
      default_subject: defaultSubject,
      default_sample_data: entry.previewData ?? {},
      row: row ?? null,
    };
  });

/** Render template HTML for preview iframe. Uses DB override if present. */
export const renderEmailStudioPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateName: string;
      sampleDataOverride?: Record<string, any>;
      // If provided, render this HTML/mode instead of the persisted row (live editor preview)
      draft?: { mode: "code" | "html" | "unlayer"; html_content?: string };
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { renderTemplateHtml } = await import(
      "./email-templates/render.server"
    );
    return await renderTemplateHtml({
      templateName: data.templateName,
      sampleDataOverride: data.sampleDataOverride,
      draft: data.draft,
      supabase: context.supabase,
    });
  });

/** Upsert template override + snapshot to versions. */
export const saveEmailStudioTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateName: string;
      display_name: string;
      subject?: string | null;
      preview_text?: string | null;
      from_name?: string | null;
      mode: "code" | "html" | "unlayer";
      html_content?: string | null;
      unlayer_design?: any;
      sample_data?: Record<string, any> | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supa = context.supabase as any;

    const { data: existing } = await supa
      .from("email_templates")
      .select("id")
      .eq("template_name", data.templateName)
      .maybeSingle();

    const payload = {
      template_name: data.templateName,
      display_name: data.display_name,
      subject: data.subject ?? null,
      preview_text: data.preview_text ?? null,
      from_name: data.from_name ?? null,
      mode: data.mode,
      html_content: data.html_content ?? null,
      unlayer_design: data.unlayer_design ?? null,
      sample_data: data.sample_data ?? null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    let row: any;
    if (existing?.id) {
      const { data: updated, error } = await supa
        .from("email_templates")
        .update(payload)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      row = updated;
    } else {
      const { data: inserted, error } = await supa
        .from("email_templates")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      row = inserted;
    }

    // Snapshot
    await supa.from("email_template_versions").insert({
      template_id: row.id,
      template_name: row.template_name,
      subject: row.subject,
      mode: row.mode,
      unlayer_design: row.unlayer_design,
      html_content: row.html_content,
      sample_data: row.sample_data,
      created_by: context.userId,
    });

    return { ok: true, row };
  });

/** Reset override so template falls back to code default. */
export const resetEmailStudioTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { templateName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    await (context.supabase as any)
      .from("email_templates")
      .delete()
      .eq("template_name", data.templateName);
    return { ok: true };
  });

/** Send a test email using current DB config (or draft passed in). */
export const sendEmailStudioTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      templateName: string;
      to: string;
      sampleDataOverride?: Record<string, any>;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const res = await sendTemplateEmail(data.templateName, data.to, {
      templateData: data.sampleDataOverride,
      idempotencyKey: `studio-test-${data.templateName}-${Date.now()}`,
    });
    return res;
  });

/** Theme CRUD. */
export const getEmailTheme = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await (context.supabase as any)
      .from("email_theme")
      .select("*")
      .maybeSingle();
    return data;
  });

export const saveEmailTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Record<string, any>) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const supa = context.supabase as any;
    const { data: existing } = await supa
      .from("email_theme")
      .select("id")
      .maybeSingle();
    const payload = {
      brand_name: data.brand_name,
      tagline: data.tagline,
      logo_url: data.logo_url ?? null,
      color_primary: data.color_primary,
      color_accent: data.color_accent,
      color_ink: data.color_ink,
      color_body: data.color_body,
      color_background: data.color_background,
      font_family: data.font_family,
      support_email: data.support_email,
      support_phone: data.support_phone,
      address: data.address,
      site_url: data.site_url,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (existing?.id) {
      const { error } = await supa
        .from("email_theme")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supa
        .from("email_theme")
        .insert({ ...payload, singleton: true });
      if (error) throw error;
    }
    return { ok: true };
  });

/** Deliverability: recent stats aggregated from email logs. */
export const getDeliverabilityStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY missing");
    const { listEmailLogs } = await import("@lovable.dev/email-js");
    const since = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const res = await listEmailLogs(
      { limit: 100, since } as never,
      { apiKey },
    );
    const events = (res.data ?? []) as any[];
    const count = (t: string) => events.filter((e) => e.event_type === t).length;
    const sent = count("sent");
    const bounced = count("bounced");
    const complained = count("complained");
    const suppressed = count("suppressed");
    const unsubscribed = count("unsubscribed");
    const rate_limited = count("rate_limited");
    const total = sent + bounced;
    return {
      sent,
      bounced,
      complained,
      suppressed,
      unsubscribed,
      rate_limited,
      bounce_rate: total > 0 ? bounced / total : 0,
      complaint_rate: sent > 0 ? complained / sent : 0,
      history_starts_at: res.history_starts_at,
      recent: events.slice(0, 20),
    };
  });
