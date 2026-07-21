import * as React from "react";
import { render } from "@react-email/render";
import Mustache from "mustache";
import { TEMPLATES } from "./registry";

export interface RenderInput {
  templateName: string;
  sampleDataOverride?: Record<string, any>;
  draft?: { mode: "code" | "html" | "unlayer"; html_content?: string | null };
  supabase: any;
}

export interface RenderedTemplate {
  html: string;
  text: string;
  subject: string;
  mode: "code" | "html" | "unlayer";
}

export async function loadEmailTheme(supabase: any) {
  const { data } = await supabase
    .from("email_theme")
    .select("*")
    .maybeSingle();
  return data ?? null;
}

export async function loadTemplateRow(supabase: any, templateName: string) {
  const { data } = await supabase
    .from("email_templates")
    .select("*")
    .eq("template_name", templateName)
    .maybeSingle();
  return data ?? null;
}

/**
 * Render a template. Precedence:
 * 1. draft (live preview from editor)
 * 2. DB override row (mode = html|unlayer|code)
 * 3. Code default from registry
 * Theme tokens are injected via {{theme.*}} for html/unlayer modes.
 */
export async function renderTemplateHtml(
  input: RenderInput,
): Promise<RenderedTemplate> {
  const entry = TEMPLATES[input.templateName];
  if (!entry) throw new Error(`Template '${input.templateName}' not found`);

  const [theme, row] = await Promise.all([
    loadEmailTheme(input.supabase),
    loadTemplateRow(input.supabase, input.templateName),
  ]);

  const sampleData = {
    ...(entry.previewData ?? {}),
    ...(row?.sample_data ?? {}),
    ...(input.sampleDataOverride ?? {}),
  };

  const mode: "code" | "html" | "unlayer" =
    input.draft?.mode ?? row?.mode ?? "code";
  const htmlSource =
    input.draft?.html_content ?? row?.html_content ?? null;

  const subject =
    row?.subject && row.subject.length > 0
      ? Mustache.render(row.subject, { ...sampleData, theme: theme ?? {} })
      : typeof entry.subject === "function"
        ? entry.subject(sampleData)
        : entry.subject;

  if (mode === "code" || !htmlSource) {
    const el = React.createElement(entry.component, sampleData);
    const html = await render(el);
    const text = await render(el, { plainText: true });
    return { html, text, subject, mode: "code" };
  }

  // html / unlayer: run Mustache with sample data + theme
  const rendered = Mustache.render(htmlSource, {
    ...sampleData,
    theme: theme ?? {},
  });
  // Naive plaintext: strip tags
  const text = rendered
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { html: rendered, text, subject, mode };
}
