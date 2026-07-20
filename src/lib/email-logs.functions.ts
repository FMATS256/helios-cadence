import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listEmailLogs } from "@lovable.dev/email-js";

export type EmailLogFilters = {
  recipient?: string;
  event_type?: string;
  since?: string;
  limit?: number;
  cursor?: string;
};

export const fetchEmailLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: EmailLogFilters) => data ?? {})
  .handler(async ({ data, context }) => {
    // Admin gate
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "master_admin",
    });
    if (!isAdmin) throw new Error("Forbidden");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");

    const filters: Record<string, unknown> = {
      limit: Math.min(data.limit ?? 100, 100),
    };
    if (data.recipient) filters.recipient = data.recipient;
    if (data.event_type) filters.event_type = data.event_type;
    if (data.since) filters.since = data.since;
    if (data.cursor) filters.cursor = data.cursor;

    const res = await listEmailLogs(filters as never, { apiKey });
    return {
      events: res.data,
      pagination: res.pagination,
      history_starts_at: res.history_starts_at,
    };
  });
