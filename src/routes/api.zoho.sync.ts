import { createFileRoute } from "@tanstack/react-router";
import { requireBearer, json } from "@/lib/api-auth.server";
import { syncAll, syncEntity } from "@/lib/zoho-sync.server";

export const Route = createFileRoute("/api/zoho/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireBearer(request);
        if (auth instanceof Response) return auth;
        let body: { entity?: string } = {};
        try { body = (await request.json()) as { entity?: string }; } catch { /* empty body ok */ }
        const results = body.entity ? [await syncEntity(body.entity)] : await syncAll();
        return json({ results });
      },
    },
  },
});
