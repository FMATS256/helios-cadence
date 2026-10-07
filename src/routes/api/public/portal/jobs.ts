/**
 * GET /api/public/portal/jobs?account_number=M10457
 *
 * Installations and service jobs for a customer, so the client app can show
 * scheduled visits, progress and completion.
 *
 * Auth: header `x-api-key: <PORTAL_API_KEY>` (or `Authorization: Bearer ...`).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, findCustomer, json, requireApiKey,
} from "@/lib/portal-api.server";

export const Route = createFileRoute("/api/public/portal/jobs")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const accountNumber = url.searchParams.get("account_number");
        const customerId = url.searchParams.get("customer_id");
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
        if (!accountNumber && !customerId) return fail(400, "Provide account_number or customer_id");

        const sb = await db();
        const customer = await findCustomer(sb, accountNumber, customerId);
        if (!customer) return fail(404, "Customer not found");

        const { data: tasks, error } = await sb.from("service_tasks")
          .select("id,title,task_type,status,priority,scheduled_date,site_address,site_latitude,site_longitude,completed_at,created_at")
          .eq("customer_id", customer.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return fail(500, error.message);

        return json({
          ok: true,
          count: tasks?.length ?? 0,
          jobs: (tasks ?? []).map((t: any) => ({
            id: t.id,
            title: t.title,
            type: t.task_type,
            status: t.status,
            priority: t.priority,
            scheduled_date: t.scheduled_date,
            site: t.site_address
              ? { address: t.site_address, latitude: t.site_latitude, longitude: t.site_longitude }
              : null,
            completed_at: t.completed_at,
            created_at: t.created_at,
          })),
        });
      },
    },
  },
});
