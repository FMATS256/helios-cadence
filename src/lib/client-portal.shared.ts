import { z } from "zod";

export const clientPaymentSchema = z.object({
  request_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable(),
  amount: z.number().finite().positive().max(10000000),
  currency: z.enum(["USD", "ZWG", "ZAR"]),
  method: z.enum(["bank_transfer", "ecocash", "cash", "card"]),
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reference: z.string().trim().min(1).max(200),
  proof: z.object({ path: z.string().min(1), name: z.string().max(200), type: z.enum(["application/pdf", "image/jpeg", "image/png"]), size: z.number().int().positive().max(10 * 1024 * 1024) }),
}).strict();

export const clientTicketSchema = z.object({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(10000),
  priority: z.enum(["normal", "high", "urgent"]),
}).strict();

export function invoiceBalances(invoices: Array<Record<string, any>>, allocations: Array<{ invoice_id: string; amount: number }>) {
  const paid = new Map<string, number>();
  for (const row of allocations) paid.set(row.invoice_id, (paid.get(row.invoice_id) ?? 0) + Number(row.amount));
  return invoices.filter((row) => !["draft", "void", "cancelled"].includes(row.status)).map((row) => ({
    ...row, paid: Math.round((paid.get(row.id) ?? 0) * 100) / 100,
    balance: Math.max(0, Math.round((Number(row.total) - (paid.get(row.id) ?? 0)) * 100) / 100),
  }));
}

export function ownedProofPath(path: string, customerId: string, userId: string) {
  return path.startsWith(`${customerId}/portal/${userId}/`) && !path.includes("..") && !path.includes("\\");
}