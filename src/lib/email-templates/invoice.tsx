import * as React from 'react'
import { Body, Head, Html, Link, Preview, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, greeting } from './_brand'

interface LineItem { description: string; quantity: number; unit_price: number; line_total: number }
interface Props {
  companyName?: string
  recipientTitle?: string
  invoiceNumber?: string
  issueDate?: string
  dueDate?: string
  currency?: string
  subtotal?: number
  tax?: number
  total?: number
  items?: LineItem[]
  invoiceUrl?: string
}

const fmt = (n?: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n) || 0)

export const InvoiceEmail = ({
  companyName = '',
  recipientTitle,
  invoiceNumber = '—',
  issueDate,
  dueDate,
  currency = 'USD',
  total = 0,
  invoiceUrl = BRAND.siteUrl,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Invoice ${invoiceNumber} — ${fmt(total, currency)}`}</Preview>
    <Body style={businessBody}>
      <Text style={paragraph}>{greeting(recipientTitle, companyName)}</Text>
      <Text style={paragraph}>
        Please find attached invoice {invoiceNumber} for {fmt(total, currency)}.
      </Text>
      <Text style={paragraph}>
        {issueDate ? <>Invoice date: {issueDate}<br /></> : null}
        {dueDate ? <>Payment due: {dueDate}<br /></> : null}
        The attached PDF contains the full invoice details and payment instructions.
      </Text>
      <Text style={paragraph}>
        <Link href={invoiceUrl} style={{ color: BRAND.primary }}>View invoice online</Link>
      </Text>
      <Text style={paragraph}>Please reply to this email if you have any questions.</Text>
    </Body>
  </Html>
)

const businessBody = { backgroundColor: '#ffffff', color: BRAND.ink, fontFamily: 'Arial, Helvetica, sans-serif', padding: '16px', margin: 0 }
const paragraph = { fontSize: '14px', lineHeight: '21px', margin: '0 0 16px' }

export default InvoiceEmail

export const template = {
  component: InvoiceEmail,
  subject: (d: Props) => `Invoice ${d?.invoiceNumber ?? ''} from ${BRAND.name}`.trim(),
  displayName: 'Invoice Issued',
  previewData: {
    companyName: 'Acme Ltd',
    invoiceNumber: 'INV-00042',
    issueDate: '2026-07-21',
    dueDate: '2026-08-04',
    currency: 'USD',
    subtotal: 187,
    tax: 0,
    total: 187,
    items: [{ description: 'Starlink Business Plan (monthly)', quantity: 1, unit_price: 187, line_total: 187 }],
    invoiceUrl: BRAND.siteUrl + '/invoices',
  },
} satisfies TemplateEntry
