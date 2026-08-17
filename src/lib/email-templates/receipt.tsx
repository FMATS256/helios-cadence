import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  recipientTitle?: string
  receiptNumber?: string
  amount?: number
  currency?: string
  method?: string
  reference?: string
  paidAt?: string
  serviceContext?: string
}

const fmt = (n?: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n) || 0)

export const ReceiptEmail = ({
  companyName = '',
  recipientTitle,
  receiptNumber = '—',
  amount = 0,
  currency = 'USD',
  method,
  reference,
  paidAt,
  serviceContext,
}: Props) => (
  <EmailShell
    preview={`Payment received: ${fmt(amount, currency)}`}
    kicker="Payment Confirmed"
    title="Thank you for your payment"
    subtitle={`${fmt(amount, currency)} received. Receipt ${receiptNumber}.`}
  >
    <Text style={styles.text}>{greeting(recipientTitle, companyName)}</Text>
    <Text style={styles.text}>
      We've received your payment. This email is your official receipt — please retain it for your
      records.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Receipt Details</Text>
      <DetailRow label="Receipt Number" value={receiptNumber} />
      <DetailRow label="Amount" value={fmt(amount, currency)} />
      <DetailRow label="Method" value={method} />
      <DetailRow label="Reference" value={reference} />
      <DetailRow label="Paid On" value={paidAt} />
      <DetailRow label="Applied To" value={serviceContext} />
    </Section>

    <Text style={styles.text}>
      Any linked invoices have been updated automatically. If you notice anything unexpected,
      reply to this email and we'll sort it out immediately.
    </Text>
  </EmailShell>
)

export default ReceiptEmail

export const template = {
  component: ReceiptEmail,
  subject: (d: Props) => `Receipt ${d?.receiptNumber ?? ''} — ${BRAND.name}`.trim(),
  displayName: 'Payment Receipt',
  previewData: {
    companyName: 'Acme Ltd',
    receiptNumber: 'RCP-00128',
    amount: 187,
    currency: 'USD',
    method: 'EcoCash',
    reference: 'EC-9284712',
    paidAt: '2026-07-21',
    serviceContext: 'Starlink Business Plan',
  },
} satisfies TemplateEntry
