// Server-only helper: fire-and-forget notification sends that never break the
// caller's write path. Suppression is enforced server-side by Lovable; we log
// unusual outcomes but never throw.
import { sendTemplateEmail } from './email-templates/send-email'

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
