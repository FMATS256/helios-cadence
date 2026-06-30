import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireBearer, json } from "@/lib/api-auth.server";

export const Route = createFileRoute("/api/zoho/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await requireBearer(request);
        if (auth instanceof Response) return auth;
        const url = new URL(request.url);
        const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
        const status = url.searchParams.get("status");
        let q = supabaseAdmin.from("zoho_invoices").select("*").order("date", { ascending: false }).limit(limit);
        if (status) q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return json({ error: error.message }, { status: 500 });
        return json({ invoices: data ?? [] });
      },
    },
  },
});
