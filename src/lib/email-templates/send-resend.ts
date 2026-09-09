/**
 * Resend email sender (gateway-backed).
 *
 * Use this helper when an email needs binary attachments (PDFs, invoices,
 * quotations). Plain transactional emails continue to use
 * `sendTemplateEmail` via Lovable's managed email API.
 *
 * Requires:
 *   LOVABLE_API_KEY  (workspace secret)
 *   RESEND_API_KEY   (connector secret, injected by standard_connectors)
 *
 * The sending domain must be verified in Resend. If you also use Lovable
 * Emails on the same subdomain, the two services conflict — use a different
 * subdomain for Resend, or disable Lovable Emails and remove its NS records.
 */
import { createClient } from '@supabase/supabase-js'
import { TEMPLATES } from './registry'
import { renderTemplateHtml } from './render.server'

const SITE_NAME = 'IMT Solutions'
const DEFAULT_FROM_DOMAIN = 'notify.notifications.imtsolutions.co.zw'
const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend/emails'

export interface Attachment {
  filename: string
  /** Raw bytes or a pre-encoded base64 string. */
  content: Uint8Array | Buffer | string
  contentType?: string
}

export interface SendResendEmailOptions {
  templateName: string
  to: string
  templateData?: Record<string, any>
  replyTo?: string
  attachments?: Attachment[]
  /** Full From address, e.g. "IMT Solutions <noreply@example.com>". */
  from?: string
  /** Domain portion only; ignored when `from` is supplied. */
  fromDomain?: string
}

function serverSupabase() {
  const url = process.env.SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
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

const ROLE_LABELS: Record<string, string> = {
  master_admin: 'Master Administrator',
  operations_manager: 'Operations Manager',
  corporate_account_manager: 'Corporate Account Manager',
  customer_account_manager: 'Customer Account Manager',
  key_account_manager: 'Key Account Manager',
  account_manager: 'Account Manager',
  finance: 'Finance Coordinator',
  noc: 'NOC Engineer',
  technical_support: 'Technical Support Engineer',
  cloud_engineer: 'Cloud Engineer',
  cyber_security: 'Cybersecurity Specialist',
  sales: 'Sales Representative',
  customer_success: 'Customer Success',
}

async function lookupSenderRole(supabase: any, email: string): Promise<string | undefined> {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()
    if (!profile?.id) return undefined
    const { data: roles } = await supabase.from('user_roles').select('role').eq('user_id', profile.id)
    const role = roles?.[0]?.role
    return role ? (ROLE_LABELS[role] ?? String(role).replace(/_/g, ' ')) : undefined
  } catch {
    return undefined
  }
}

function bytesToBase64(bytes: Uint8Array | Buffer): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64')
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export type SendResendEmailResult =
  | { sent: true }
  | { sent: false; error: string }

export async function sendResendEmail(
  options: SendResendEmailOptions,
): Promise<SendResendEmailResult> {
  const apiKey = process.env.LOVABLE_API_KEY
  const resendKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('LOVABLE_API_KEY is not configured')
  if (!resendKey) throw new Error('RESEND_API_KEY is not configured')

  const template = TEMPLATES[options.templateName]
  if (!template) {
    throw new Error(
      `Template '${options.templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
    )
  }

  const recipient = options.to
  if (!recipient || !/@/.test(recipient)) throw new Error('Recipient is required')

  const supabase = serverSupabase()

  const templateData = { ...(options.templateData ?? {}) }
  if (!templateData.senderEmail && options.replyTo) templateData.senderEmail = options.replyTo
  if (!templateData.senderPhone && templateData.senderName) templateData.senderPhone = '+263 86 12 004321'
  if (!templateData.senderRole && options.replyTo) {
    templateData.senderRole = await lookupSenderRole(supabase, options.replyTo)
  }
  if (!templateData.recipientTitle) {
    templateData.recipientTitle = await lookupTitle(supabase, recipient)
  }

  const { html, text, subject } = await renderTemplateHtml({
    templateName: options.templateName,
    sampleDataOverride: templateData,
    supabase,
  })

  const fromDomain =
    options.fromDomain ?? process.env.RESEND_FROM_DOMAIN ?? DEFAULT_FROM_DOMAIN
  const from = options.from ?? `${SITE_NAME} <noreply@${fromDomain}>`

  const body: Record<string, any> = {
    from,
    to: [recipient],
    subject,
    html,
    text,
  }

  if (options.replyTo) body.reply_to = options.replyTo

  if (options.attachments?.length) {
    body.attachments = options.attachments.map((att) => ({
      filename: att.filename,
      content:
        typeof att.content === 'string'
          ? att.content
          : bytesToBase64(att.content as Uint8Array | Buffer),
      content_type: att.contentType ?? 'application/octet-stream',
    }))
  }

  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Connection-Api-Key': resendKey,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[resend] gateway ${response.status}: ${errorBody}`)
    return {
      sent: false,
      error: `Provider request failed [${response.status}]: ${errorBody.slice(0, 300)}`,
    }
  }

  // Resend returns { id: "..." } on success; we don't need it here.
  await response.json().catch(() => null)
  return { sent: true }
}
