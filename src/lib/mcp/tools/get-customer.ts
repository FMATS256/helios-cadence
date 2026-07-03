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
  name: "get_customer",
  title: "Get customer",
  description: "Fetch a customer's full profile by M-number (e.g. M0001) including related tickets and services counts.",
  inputSchema: {
    account_number: z.string().regex(/^M\d{4,}$/i, "Must be an M-number like M0001"),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ account_number }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const acct = account_number.toUpperCase();
    const client = sb(ctx);
    const { data, error } = await client.from("customers").select("*").eq("account_number", acct).is("deleted_at", null).maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: `No customer ${acct}` }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { customer: data },
    };
  },
});
