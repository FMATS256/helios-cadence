// Server-only helper: fire-and-forget notification sends that never break the
// caller's write path. Suppression is enforced server-side by Lovable; we log
// unusual outcomes but never throw.
import { maskEmail } from "@/lib/safe-output";
import { sendTemplateEmail } from './email-templates/send-email'
import { sendResendEmail, type Attachment } from './email-templates/send-resend'

export interface NotifySender {
  /** Display name on the From line. */
  fromName?: string
  /** Local part on the verified sending domain (usually the staff email prefix). */
  fromLocal?: string
  /** Where customer replies should land. */
  replyTo?: string
}

export async function notify(
  templateName: string,
  to: string | null | undefined,
  templateData: Record<string, any>,
  idempotencyKey?: string,
  sender?: NotifySender,
) {
  if (!to || !/@/.test(to)) return
  try {
    const res = await sendTemplateEmail(templateName, to, {
      templateData,
      idempotencyKey,
      ...(sender ?? {}),
    })
    if (!res.sent) console.info(`[notify] ${templateName} -> ${maskEmail(to)}: ${res.reason}`)
  } catch (e: any) {
    console.error(`[notify] ${templateName} -> ${maskEmail(to)} failed:`, e?.code ?? e?.message ?? e)
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
    if (!res.sent) console.info(`[notifyWithAttachment] ${templateName} -> ${maskEmail(to)}: ${res.error}`)
  } catch (e: any) {
    console.error(`[notifyWithAttachment] ${templateName} -> ${maskEmail(to)} failed:`, e?.code ?? e?.message ?? e)
  }
}
