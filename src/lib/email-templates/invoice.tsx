import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

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
  subtotal = 0,
  tax = 0,
  total = 0,
  items = [],
  invoiceUrl = BRAND.siteUrl,
}: Props) => (
  <EmailShell
    preview={`Invoice ${invoiceNumber} — ${fmt(total, currency)}`}
    kicker="New Invoice"
    title={`Invoice ${invoiceNumber}`}
    subtitle={`Total ${fmt(total, currency)} · Due ${dueDate ?? '—'}`}
  >
    <Text style={styles.text}>{greeting(recipientTitle, companyName)}</Text>
    <Text style={styles.text}>
      A new invoice has been issued to your account. Full details are below.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Order Details</Text>
      <DetailRow label="Invoice Number" value={invoiceNumber} />
      <DetailRow label="Issue Date" value={issueDate} />
      <DetailRow label="Due Date" value={dueDate} />
    </Section>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Products & Services</Text>
      {items.map((it, i) => (
        <Text key={i} style={styles.row}>
          <span style={{ ...styles.rowValue, display: 'block' }}>{it.description}</span>
          <span style={styles.rowLabel}>Qty {it.quantity} × {fmt(it.unit_price, currency)}</span>
          <span style={{ float: 'right', ...styles.rowValue }}>{fmt(it.line_total, currency)}</span>
        </Text>
      ))}
      <Text style={{ ...styles.row, borderTop: `1px solid ${BRAND.border}`, paddingTop: '10px', marginTop: '10px' }}>
        <span style={styles.rowLabel}>Subtotal</span>
        <span style={{ float: 'right' }}>{fmt(subtotal, currency)}</span>
      </Text>
      {tax > 0 && (
        <Text style={styles.row}>
          <span style={styles.rowLabel}>Tax</span>
          <span style={{ float: 'right' }}>{fmt(tax, currency)}</span>
        </Text>
      )}
      <Text style={{ ...styles.row, fontSize: '16px', color: BRAND.teal, fontWeight: 700 }}>
        <span>Total</span>
        <span style={{ float: 'right' }}>{fmt(total, currency)}</span>
      </Text>
    </Section>

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={invoiceUrl}>View & Pay Invoice</Button>
    </Section>
  </EmailShell>
)

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
