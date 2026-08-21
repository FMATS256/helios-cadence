// Server-only helper: fire-and-forget notification sends that never break the
// caller's write path. Suppression is enforced server-side by Lovable; we log
// unusual outcomes but never throw.
import { sendTemplateEmail } from './email-templates/send-email'
import { sendResendEmail, type Attachment } from './email-templates/send-resend'

export async function notify(
  templateName: string,
  to: string | null | undefined,
  templateData: Record<string, any>,
  idempotencyKey?: string,
) {
  if (!to || !/@/.test(to)) return
  try {
    const res = await sendTemplateEmail(templateName, to, {
      templateData,
      idempotencyKey,
    })
    if (!res.sent) console.info(`[notify] ${templateName} -> ${to}: ${res.reason}`)
  } catch (e: any) {
    console.error(`[notify] ${templateName} -> ${to} failed:`, e?.code ?? e?.message ?? e)
  }
}

/**
 * Send a templated email with binary attachments through Resend.
 * Falls back to a link-only Lovable email if Resend is not configured or if
 * no attachments are supplied.
 */
export async function notifyWithAttachment(
  templateName: string,
  to: string | null | undefined,
  templateData: Record<string, any>,
  attachments: Attachment[],
  idempotencyKey?: string,
) {
  if (!to || !/@/.test(to)) return

  // No attachments or no Resend key -> use the regular managed email path.
  if (!attachments.length || !process.env.RESEND_API_KEY) {
    return notify(templateName, to, templateData, idempotencyKey)
  }

  try {
    const res = await sendResendEmail({
      templateName,
      to,
      templateData,
      attachments,
    })
    if (!res.sent) console.info(`[notifyWithAttachment] ${templateName} -> ${to}: ${res.error}`)
  } catch (e: any) {
    console.error(`[notifyWithAttachment] ${templateName} -> ${to} failed:`, e?.code ?? e?.message ?? e)
  }
}
