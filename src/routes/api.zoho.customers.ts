import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireBearer, json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/zoho/customers")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireBearer(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
        const { data, error } = await supabaseAdmin
          .from("zoho_customers")
          .select("*")
          .order("display_name", { ascending: true })
          .limit(limit);
        if (error) return json({ error: error.message }, { status: 500 });
        return json({ customers: data ?? [] });
      },
    },
  },
});
