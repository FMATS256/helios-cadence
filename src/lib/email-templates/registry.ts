import type { ComponentType } from 'react'

import { template as welcomeTemplate } from './welcome'
import { template as serverReadyTemplate } from './server-ready'
import { template as invoiceTemplate } from './invoice'
import { template as quoteTemplate } from './quote'
import { template as receiptTemplate } from './receipt'
import { template as paymentReminderTemplate } from './payment-reminder'
import { template as renewalReminderTemplate } from './renewal-reminder'
import { template as ticketUpdateTemplate } from './ticket-update'
import { template as licenseIssuedTemplate } from './license-issued'
import { template as opsDigestTemplate } from './ops-digest'
import { template as generalMessageTemplate } from './general-message'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  welcome: welcomeTemplate,
  'server-ready': serverReadyTemplate,
  invoice: invoiceTemplate,
  quote: quoteTemplate,
  receipt: receiptTemplate,
  'payment-reminder': paymentReminderTemplate,
  'renewal-reminder': renewalReminderTemplate,
  'ticket-update': ticketUpdateTemplate,
  'license-issued': licenseIssuedTemplate,
  'ops-digest': opsDigestTemplate,
  'general-message': generalMessageTemplate,
}
