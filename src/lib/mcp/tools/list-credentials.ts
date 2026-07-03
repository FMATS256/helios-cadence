import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function sb(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_credentials",
  title: "List credentials (metadata only)",
  description: "List credential vault entries by metadata. Never returns secret values — use the app to reveal secrets.",
  inputSchema: {
    account_number: z.string().regex(/^M\d{4,}$/i).optional(),
    type: z.string().trim().optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ account_number, type, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    let q = sb(ctx).from("credentials").select("id,name,credential_type,account_number,expires_at,created_at").is("archived_at", null).order("created_at", { ascending: false }).limit(limit);
    if (account_number) q = q.eq("account_number", account_number.toUpperCase());
    if (type) q = q.eq("credential_type", type);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { credentials: data ?? [] },
    };
  },
});
