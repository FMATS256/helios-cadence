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
  name: "create_ticket",
  title: "Create support ticket",
  description: "Create a new support ticket linked to a customer M-number.",
  inputSchema: {
    account_number: z.string().regex(/^M\d{4,}$/i, "Must be an M-number like M0001"),
    subject: z.string().trim().min(3).max(200),
    description: z.string().trim().min(1).max(5000).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ account_number, subject, description, priority }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const client = sb(ctx);
    const acct = account_number.toUpperCase();
    const { data: customer, error: cErr } = await client.from("customers").select("id").eq("account_number", acct).maybeSingle();
    if (cErr || !customer) return { content: [{ type: "text", text: `Customer ${acct} not found` }], isError: true };
    const { data, error } = await client.from("tickets").insert({
      customer_id: (customer as any).id,
      subject,
      description: description ?? null,
      priority,
      status: "open",
      created_by: ctx.getUserId(),
    }).select().single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created ticket for ${acct}: ${subject}` }],
      structuredContent: { ticket: data },
    };
  },
});
