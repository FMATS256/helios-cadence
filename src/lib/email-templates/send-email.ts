import { EmailAPIError, sendLovableEmail } from '@lovable.dev/email-js'
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from './registry'
import { renderTemplateHtml } from './render.server'

// Server-only: reads LOVABLE_API_KEY. Never import from client components.

const SITE_NAME = "IMT Solutions"
const SENDER_DOMAIN = "notify.notifications.imtsolutions.co.zw"
const FROM_DOMAIN = "notify.notifications.imtsolutions.co.zw"

export type SendTemplateEmailResult =
  | { sent: true }
  | { sent: false; reason: 'recipient_suppressed' }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  idempotencyKey?: string
  replyTo?: string
  /** Display name on the From line, e.g. "Farai Matare (IMT Solutions)". */
  fromName?: string
  /** Local part of the From address on the verified domain, e.g. "farai". */
  fromLocal?: string
}

/**
 * One verified sending domain, many named senders.
 * Turns a staff email/name into a safe local part on the verified domain
 * (farai.matare@imtsolutions.co.zw -> farai.matare@<FROM_DOMAIN>).
 */
export function senderLocalPart(input?: string | null, fallback = 'noreply'): string {
  const raw = String(input ?? '').split('@')[0]
  const local = raw
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 40)
  return local || fallback
}

/** Build the From header used by every send. */
export function senderFrom(fromName?: string | null, fromLocal?: string | null) {
  const name = String(fromName ?? '').replace(/["\\<>]/g, '').trim() || SITE_NAME
  const local = senderLocalPart(fromLocal)
  return `"${name}" <${local}@${FROM_DOMAIN}>`
}

async function lookupTitle(supabase: any, email: string): Promise<string | undefined> {
  try {
    const [contact, customer] = await Promise.all([
      supabase
        .from('customer_contacts')
        .select('title')
        .ilike('email', email)
        .not('title', 'is', null)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('customers')
        .select('title')
        .ilike('primary_email', email)
        .not('title', 'is', null)
        .limit(1)
        .maybeSingle(),
    ])
    return (contact?.data?.title || customer?.data?.title) ?? undefined
  } catch {
    return undefined
  }
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

  // Courtesy title (Mr/Mrs/Dr/Prof…) — resolved from the CRM when the caller
  // did not supply one, so every email addresses the person properly.
  const templateData = { ...(options.templateData ?? {}) }
  if (!templateData.senderName && options.fromName) {
    templateData.senderName = options.fromName.replace(/\s*\(IMT Solutions\)\s*$/i, '').trim()
  }
  if (!templateData.senderEmail && options.replyTo) templateData.senderEmail = options.replyTo
  if (!templateData.senderPhone && templateData.senderName) templateData.senderPhone = '+263 86 12 004321'
  if (!templateData.recipientTitle && recipient) {
    templateData.recipientTitle = await lookupTitle(supabase, recipient)
  }

  const { html, text, subject } = await renderTemplateHtml({
    templateName,
    sampleDataOverride: templateData,
    supabase,
  })

  try {
    await sendLovableEmail(
      {
        to: recipient,
        from: senderFrom(options.fromName, options.fromLocal),
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

