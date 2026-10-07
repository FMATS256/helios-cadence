/**
 * GET /api/public/portal/invoices?account_number=M10457
 *
 * Everything a client app needs for the money screens: open and settled
 * invoices with line items, the running statement (payments, credits,
 * installments) and the current balance.
 *
 * Auth: header `x-api-key: <PORTAL_API_KEY>` (or `Authorization: Bearer ...`).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  db, fail, findCustomer, json, num, openInvoices, requireApiKey, round,
} from "@/lib/portal-api.server";

export const Route = createFileRoute("/api/public/portal/invoices")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const denied = requireApiKey(request);
        if (denied) return denied;

        const url = new URL(request.url);
        const accountNumber = url.searchParams.get("account_number");
        const customerId = url.searchParams.get("customer_id");
        const includeSettled = url.searchParams.get("include_settled") === "true";
        if (!accountNumber && !customerId) return fail(400, "Provide account_number or customer_id");

        const sb = await db();
        const customer = await findCustomer(sb, accountNumber, customerId);
        if (!customer) return fail(404, "Customer not found");

        const open = await openInvoices(sb, customer.id);

        let settled: any[] = [];
        if (includeSettled) {
          const { data } = await sb.from("invoices")
            .select("id,invoice_number,status,issue_date,due_date,currency,total,paid_at")
            .eq("customer_id", customer.id)
            .in("status", ["paid", "settled"])
            .is("archived_at", null)
            .order("issue_date", { ascending: false })
            .limit(50);
          settled = (data ?? []).map((i: any) => ({
            id: i.id,
            invoice_number: i.invoice_number,
            status: i.status,
            issue_date: i.issue_date,
            due_date: i.due_date,
            currency: i.currency,
            total: round(num(i.total)),
            paid: round(num(i.total)),
            balance: 0,
            overdue: false,
          }));
        }

        const invoiceIds = [...open, ...settled].map((i: any) => i.id);
        const { data: lines } = invoiceIds.length
          ? await sb.from("invoice_line_items")
              .select("invoice_id,description,quantity,unit_price,amount")
              .in("invoice_id", invoiceIds)
          : { data: [] as any[] };
        const linesByInvoice: Record<string, any[]> = {};
        for (const l of lines ?? []) {
          (linesByInvoice[l.invoice_id] ??= []).push({
            description: l.description,
            quantity: num(l.quantity),
            unit_price: round(num(l.unit_price)),
            amount: round(num(l.amount)),
          });
        }

        const [{ data: payments }, { data: credits }, { data: schedules }] = await Promise.all([
          sb.from("payments")
            .select("id,receipt_number,amount,currency,method,payment_date,created_at")
            .eq("customer_id", customer.id)
            .order("payment_date", { ascending: false })
            .limit(50),
          sb.from("customer_credits")
            .select("id,amount,balance,currency,status,created_at")
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false })
            .limit(20),
          sb.from("payment_schedules")
            .select("id,title,status,currency,total_amount,start_date")
            .eq("customer_id", customer.id)
            .order("created_at", { ascending: false })
            .limit(10),
        ]);

        const scheduleIds = (schedules ?? []).map((s: any) => s.id);
        const { data: installments } = scheduleIds.length
          ? await sb.from("payment_schedule_installments")
              .select("schedule_id,due_date,amount,status,paid_at")
              .in("schedule_id", scheduleIds)
              .order("due_date", { ascending: true })
          : { data: [] as any[] };

        const outstanding = round(open.reduce((t: number, i: any) => t + num(i.balance), 0));
        const creditBalance = round(
          (credits ?? []).reduce((t: number, c: any) => t + num(c.balance), 0),
        );

        return json({
          ok: true,
          customer: {
            id: customer.id,
            account_number: customer.account_number,
            company_name: customer.company_name,
          },
          balance: {
            currency: "USD",
            outstanding,
            overdue: round(open.filter((i: any) => i.overdue).reduce((t: number, i: any) => t + num(i.balance), 0)),
            credit: creditBalance,
            net_due: round(Math.max(0, outstanding - creditBalance)),
          },
          invoices: [...open, ...settled].map((i: any) => ({
            ...i,
            line_items: linesByInvoice[i.id] ?? [],
          })),
          payments: (payments ?? []).map((p: any) => ({
            id: p.id,
            receipt_number: p.receipt_number,
            amount: round(num(p.amount)),
            currency: p.currency,
            method: p.method,
            payment_date: p.payment_date,
          })),
          credits: (credits ?? []).map((c: any) => ({
            id: c.id,
            amount: round(num(c.amount)),
            balance: round(num(c.balance)),
            currency: c.currency,
            status: c.status,
          })),
          installment_schedules: (schedules ?? []).map((s: any) => ({
            id: s.id,
            title: s.title,
            status: s.status,
            currency: s.currency,
            total_amount: round(num(s.total_amount)),
            start_date: s.start_date,
            installments: (installments ?? [])
              .filter((x: any) => x.schedule_id === s.id)
              .map((x: any) => ({
                due_date: x.due_date,
                amount: round(num(x.amount)),
                status: x.status,
                paid_at: x.paid_at,
              })),
          })),
        });
      },
    },
  },
});
