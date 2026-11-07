import * as React from 'react'
import { Body, Head, Html, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, greeting } from './_brand'

interface LineItem { description: string; quantity: number; unit_price: number; line_total: number }
interface Props {
  companyName?: string
  quoteNumber?: string
  title?: string
  recipientTitle?: string
  issueDate?: string
  validUntil?: string
  currency?: string
  subtotal?: number
  tax?: number
  total?: number
  items?: LineItem[]
  quoteUrl?: string
  message?: string
}

const fmt = (n?: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n) || 0)

export const QuoteEmail = ({
  companyName = '',
  recipientTitle,
  quoteNumber = '—',
  title = 'Quotation',
  issueDate,
  validUntil,
  currency = 'USD',
  subtotal = 0,
  tax = 0,
  total = 0,
  items = [],
  quoteUrl,
  message,
}: Props) => {
  return (
  <Html lang="en"><Head /><Preview>{`Quotation ${quoteNumber} — ${fmt(total, currency)}`}</Preview>
    <Body style={{ backgroundColor: '#ffffff', color: BRAND.ink, fontFamily: 'Arial, Helvetica, sans-serif', padding: '16px' }}>
      <Text style={paragraph}>{greeting(recipientTitle, companyName)}</Text>
      <Text style={paragraph}>{message || `Please find attached quotation ${quoteNumber} for ${title}, totalling ${fmt(total, currency)}.`}</Text>
      <Text style={paragraph}>The attached PDF contains the full breakdown and terms.{validUntil ? ` This quotation is valid until ${validUntil}.` : ''}</Text>
      <Text style={paragraph}>Please reply to confirm acceptance or request any changes.</Text>
    </Body>
  </Html>
  )
}

const paragraph = { fontSize: '14px', lineHeight: '21px', margin: '0 0 16px' }

export default QuoteEmail

export const template = {
  component: QuoteEmail,
  subject: (d: Props) => `Quotation ${d?.quoteNumber ?? ''} from ${BRAND.name}`.trim(),
  displayName: 'Quotation Sent',
  previewData: {
    companyName: 'Acme Ltd',
    quoteNumber: 'Q-2026-001',
    title: 'Starlink Business rollout',
    issueDate: '2026-08-07',
    validUntil: '2026-09-07',
    currency: 'USD',
    subtotal: 2450,
    tax: 0,
    total: 2450,
    items: [{ description: 'Starlink Business kit + installation', quantity: 2, unit_price: 1225, line_total: 2450 }],
    quoteUrl: BRAND.siteUrl + '/quotes',
  },
} satisfies TemplateEntry
