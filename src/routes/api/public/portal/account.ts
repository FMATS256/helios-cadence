/**
 * GET /api/public/portal/account?account_number=M10457
 *
 * What the portal needs to show a client before they pay: who they are, what
 * is outstanding, which invoices are open and where money can be paid to.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, findCustomer, json, num, openInvoices, publicSubmission, requireApiKey, round,
} from "@/lib/portal-api.server";

export const Route = createFileRoute("/api/public/portal/account")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const accountNumber = url.searchParams.get("account_number");
        const customerId = url.searchParams.get("customer_id");
        if (!accountNumber && !customerId) return fail(400, "Provide account_number or customer_id");

        const sb = await db();
        const customer = await findCustomer(sb, accountNumber, customerId);
        if (!customer) return fail(404, "Customer not found");

        const invoices = await openInvoices(sb, customer.id);
        const outstanding = round(invoices.reduce((t: number, i: any) => t + num(i.balance), 0));
        const overdue = round(invoices.filter((i: any) => i.overdue).reduce((t: number, i: any) => t + num(i.balance), 0));

        const [{ data: pending }, { data: accounts }] = await Promise.all([
          sb.from("payment_submissions").select("*")
            .eq("customer_id", customer.id).in("status", ["pending", "clarification"])
            .order("created_at", { ascending: false }).limit(20),
          sb.from("cash_accounts").select("id,name,kind,currency,is_default").eq("is_active", true)
            .order("is_default", { ascending: false }).order("name"),
        ]);

        return json({
          ok: true,
          customer: {
            id: customer.id,
            account_number: customer.account_number,
            company_name: customer.company_name,
            status: customer.status,
          },
          balance: { currency: "USD", outstanding, overdue, open_invoice_count: invoices.length },
          invoices,
          pending_payments: (pending ?? []).map(publicSubmission),
          payment_destinations: (accounts ?? []).map((a: any) => ({
            id: a.id, name: a.name, kind: a.kind, currency: a.currency, is_default: a.is_default,
          })),
        });
      },
    },
  },
});
