import { welcomeDetails } from "./customer-welcome.shared";
import { AM_ROLES } from "./account-managers.shared";

/** Awaited after account creation; durable atomic claim prevents repeated welcomes. */
export async function sendCustomerWelcome(db: any, customerId: string) {
  try {
    const { data: claimed, error: claimError } = await db.rpc("claim_customer_welcome", { p_customer_id: customerId });
    if (claimError) throw new Error(claimError.message);
    if (!claimed) return;
    const { data: customer, error } = await db.from("customers").select("*").eq("id", customerId).single();
    if (error || !customer) throw new Error(error?.message ?? "Account not found");
    const { data: manager } = await db.from("profiles").select("id,full_name,email,work_email").eq("id", customer.account_manager_id).maybeSingle();
    if (manager && (manager as any).work_email) (manager as any).email = (manager as any).work_email;
    const { data: roles, error: roleError } = await db.from("user_roles").select("role").eq("user_id", customer.account_manager_id).in("role", [...AM_ROLES]);
    if (roleError) throw new Error(roleError.message);
    if (!customer.primary_email || !manager?.full_name || !manager?.email || !roles?.length) {
      const { error: blockedError } = await db.from("customers").update({ welcome_email_status: "blocked", welcome_email_error: "Client email or assigned manager's name, IMT address or account-manager role is missing" }).eq("id", customerId);
      if (blockedError) throw new Error(blockedError.message);
      return;
    }
    const [{ data: subscriptions, error: subscriptionError }, { data: preferences, error: preferencesError }] = await Promise.all([
      db.from("subscriptions").select("plan_name").eq("customer_id", customerId).eq("status", "active"),
      db.from("email_workspace_preferences").select("signature_html").eq("user_id", manager.id).maybeSingle(),
    ]);
    if (subscriptionError || preferencesError) throw new Error(subscriptionError?.message ?? preferencesError?.message);
    let login = null;
    try {
      const { provisionPortalLogin } = await import("./portal-login.server");
      const creds = await provisionPortalLogin(db, customer);
      if (creds) {
        login = { ...creds, url: "https://management.imtsolutions.co.zw/client" };
        try {
          const { autoProvisionClientServices } = await import("./client-services-provision.server");
          await autoProvisionClientServices(db, customer);
        } catch (e) { console.error("Automatic hosting/mailbox setup", customer.account_number, e); }
      }
    } catch (e) { console.error("Portal login provisioning", customer.account_number, e); }
    const details = welcomeDetails(customer, manager, (subscriptions ?? []).map((s: any) => s.plan_name), login);
    const { createAndSendEnquiryEmail } = await import("./inbox.server");
    // The inbox saves the signed HTML before delivery; failed sends remain visible/retryable.
    const result = await createAndSendEnquiryEmail({
      senderId: manager.id, senderName: details.name, senderEmail: details.from,
      senderRole: roles[0].role, signatureHtml: preferences?.signature_html || undefined,
      to: customer.primary_email, subject: details.subject, body: details.body,
      customerId, mailbox: "sales@imtsolutions.co.zw", originalSubject: true,
    });
    const { error: stateError } = await db.from("customers").update({
      welcome_email_status: result.ok ? "sent" : "failed",
      welcome_email_message_id: result.ok ? result.messageId : null,
      welcome_email_error: result.ok ? null : result.error,
    }).eq("id", customerId);
    if (stateError) throw new Error(stateError.message);
    if (!result.ok) console.error("Account welcome email failed", customer.account_number, result.error);
  } catch (error) {
    console.error("Account welcome email", error);
    // Leave ambiguous in-flight attempts untouched; never resend blindly.
  }
}