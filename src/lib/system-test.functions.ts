/**
 * System Health / Full Integration Test workspace — server functions.
 * Thin wrappers only; all logic lives in ./system-test.server.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getSystemTestState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id?: string } = {}) => input ?? {})
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const { listTestCustomers, snapshotCustomer } = await import("./system-test.server");
    const db = await admin();
    const customers = await listTestCustomers(db);
    const target = data.customer_id ?? customers[0]?.id ?? null;
    const snapshot = target ? await snapshotCustomer(db, target) : null;
    return { customers, snapshot };
  });

export const verifySystemTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const { assertTestCustomer, snapshotCustomer } = await import("./system-test.server");
    const db = await admin();
    await assertTestCustomer(db, data.customer_id);
    return snapshotCustomer(db, data.customer_id);
  });

/** Add a contact to a test customer (exercises the contacts table + fill triggers). */
export const addTestContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    customer_id: string;
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    is_primary?: boolean;
  }) => input)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const { assertTestCustomer } = await import("./system-test.server");
    const db = await admin();
    await assertTestCustomer(db, data.customer_id);
    const { data: row, error } = await db
      .from("customer_contacts")
      .insert({
        customer_id: data.customer_id,
        name: data.name,
        email: data.email ?? null,
        phone: data.phone ?? null,
        role: data.role ?? null,
        is_primary: data.is_primary ?? false,
        created_by: context.userId,
      } as any)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Upload a real file to the private customer-documents bucket for KYC testing. */
export const uploadTestDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { customer_id: string; doc_key: string }) => input)
  .handler(async ({ data, context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const { assertTestCustomer } = await import("./system-test.server");
    const db = await admin();
    const cust = await assertTestCustomer(db, data.customer_id);
    const body = new TextEncoder().encode(
      `IMT SYSTEM TEST DOCUMENT\nAccount: ${cust.account_number}\nType: ${data.doc_key}\nGenerated: ${new Date().toISOString()}\n`,
    );
    const path = `${cust.id}/system-test-${data.doc_key}-${Date.now()}.txt`;
    const { error } = await db.storage
      .from("customer-documents")
      .upload(path, body, { contentType: "text/plain", upsert: true });
    if (error) throw new Error(error.message);
    return { file_path: path, file_name: path.split("/").pop()!, mime_type: "text/plain", file_size: body.byteLength };
  });

/** Send every registered email template to a target inbox and report per-template status. */
export const runEmailTemplateSuite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { to: string }) => input)
  .handler(async ({ data, context }) => {
    const { assertStaff } = await import("./customer360.server");
    await assertStaff(context as any);
    if (!/@/.test(data.to || "")) throw new Error("A valid recipient email is required");
    const { TEMPLATES } = await import("./email-templates/registry");
    const { sendTemplateEmail } = await import("./email-templates/send-email");
    const results: Array<{ template: string; ok: boolean; reason?: string }> = [];
    for (const [name, tpl] of Object.entries(TEMPLATES)) {
      try {
        const res = await sendTemplateEmail(name, data.to, {
          templateData: (tpl as any).previewData ?? {},
          idempotencyKey: `systest-${name}-${Date.now()}`,
        });
        results.push({ template: name, ok: res.sent, reason: res.sent ? undefined : res.reason });
      } catch (e: any) {
        results.push({ template: name, ok: false, reason: e?.message ?? String(e) });
      }
    }
    return { results, sent: results.filter((r) => r.ok).length, total: results.length };
  });

/** Remove every record created by the test suite. Real customers are never touched. */
export const purgeSystemTestData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertStaff, admin } = await import("./customer360.server");
    await assertStaff(context as any);
    const { purgeTestData } = await import("./system-test.server");
    const db = await admin();
    return purgeTestData(db);
  });
