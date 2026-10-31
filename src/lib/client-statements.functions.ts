import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientStatementDates, clientStatementRequest } from "./client-statements.shared";

async function ownStatementAccount(db: any, userId: string) {
  const access = await db.rpc("portal_customer_id", { _user_id: userId });
  if (access.error || !access.data) throw new Error("Client account not linked");
  const account = await db.from("customers").select("id,created_at,account_number").eq("id", access.data).is("archived_at", null).maybeSingle();
  if (account.error || !account.data) throw new Error("Client account unavailable");
  return account.data;
}

export const listClientStatements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const account = await ownStatementAccount(context.supabase, context.userId);
    return clientStatementDates(account.created_at);
  });

export const downloadClientStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v) => clientStatementRequest.parse(v))
  .handler(async ({ data, context }) => {
    const account = await ownStatementAccount(context.supabase, context.userId);
    if (!clientStatementDates(account.created_at).some(row => row.date === data.date)) throw new Error("Statement unavailable on your account");
    // Refund and staff-contact reads need privileged access, only after resolving
    // the authenticated profile's own live account; no customer ID is accepted.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prepareClientStatements } = await import("./finance-statements.server");
    const result = await prepareClientStatements(supabaseAdmin, account.id, `${data.date.slice(0, 7)}-01`, data.date);
    return result.files;
  });