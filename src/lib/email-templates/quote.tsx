import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface LineItem { description: string; quantity: number; unit_price: number; line_total: number }
interface Props {
  companyName?: string
  title?: string
  quoteNumber?: string
  title?: string
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
  title,
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
  const hasDoc = Boolean(quoteUrl && quoteUrl !== BRAND.siteUrl)
  return (
  <EmailShell
    preview={`Quotation ${quoteNumber} — ${fmt(total, currency)}`}
    kicker="Quotation"
    title={`Quote ${quoteNumber}`}
    subtitle={`${title} · ${fmt(total, currency)}`}
  >
    <Text style={styles.text}>{greeting(title, companyName)}</Text>
    <Text style={styles.text}>
      {message || (hasDoc
        ? 'Please find your quotation below. The attached document contains the full breakdown and terms.'
        : 'Please find your quotation below.')}
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Quotation Details</Text>
      <DetailRow label="Quote Number" value={quoteNumber} />
      <DetailRow label="Reference" value={title} />
      <DetailRow label="Issued" value={issueDate} />
      <DetailRow label="Valid Until" value={validUntil} />
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

    {hasDoc && (
      <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
        <Button style={styles.button} href={quoteUrl}>View Quotation</Button>
      </Section>
    )}
  </EmailShell>
  )
}

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
