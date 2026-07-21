import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from './registry'
import { renderTemplateHtml } from './render.server'

// Server-only: reads LOVABLE_API_KEY. Never import from client components.

const SITE_NAME = "helios-cadence"
const SENDER_DOMAIN = "notify.management.imtsolutions.co.zw"
const FROM_DOMAIN = "management.imtsolutions.co.zw"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  idempotencyKey?: string
  replyTo?: string
}

function serverSupabase() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Renders a registered template (DB override if present, otherwise code default)
 * and sends it through Lovable's managed email API.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const apiKey = process.env.LOVABLE_API_KEY
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')

  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  const recipient = template.to || to
  if (!recipient) throw new Error('Recipient is required')

  const supabase = serverSupabase()
  const { html, text, subject } = await renderTemplateHtml({
    templateName,
    sampleDataOverride: options.templateData,
    supabase,
  })

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: templateName,
        idempotency_key: options.idempotencyKey || crypto.randomUUID(),
        reply_to: options.replyTo,
      },
      { apiKey, sendUrl: process.env.LOVABLE_SEND_URL }
    )
  } catch (error) {
    if (error instanceof EmailAPIError && error.code === 'recipient_suppressed') {
      return { sent: false, reason: 'recipient_suppressed' }
    }
    throw error
  }

  return { sent: true }
}

