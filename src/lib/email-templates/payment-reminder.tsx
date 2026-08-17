import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  title?: string
  invoiceNumber?: string
  amountDue?: number
  currency?: string
  dueDate?: string
  daysUntilDue?: number
  invoiceUrl?: string
}

const fmt = (n?: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n) || 0)

export const PaymentReminderEmail = ({
  companyName = 'there',
  title,
  invoiceNumber = '—',
  amountDue = 0,
  currency = 'USD',
  dueDate,
  daysUntilDue = 0,
  invoiceUrl = BRAND.siteUrl,
}: Props) => {
  const isOverdue = daysUntilDue < 0
  return (
    <EmailShell
      preview={isOverdue ? `Overdue invoice ${invoiceNumber}` : `Payment reminder: ${invoiceNumber}`}
      kicker={isOverdue ? 'Overdue Notice' : 'Payment Reminder'}
      title={isOverdue ? 'Your invoice is past due' : 'A friendly payment reminder'}
      subtitle={
        isOverdue
          ? `Invoice ${invoiceNumber} is ${Math.abs(daysUntilDue)} day(s) overdue.`
          : `Invoice ${invoiceNumber} is due in ${daysUntilDue} day(s).`
      }
    >
      <Text style={styles.text}>{greeting(title, companyName)}</Text>
      <Text style={styles.text}>
        {isOverdue
          ? 'Our records show the following invoice is past its due date. To avoid service interruption, please settle it at your earliest convenience.'
          : 'This is a friendly reminder that the following invoice is due soon.'}
      </Text>

      <Section style={styles.card}>
        <Text style={styles.cardTitle}>Invoice Summary</Text>
        <DetailRow label="Invoice Number" value={invoiceNumber} />
        <DetailRow label="Amount Due" value={fmt(amountDue, currency)} />
        <DetailRow label="Due Date" value={dueDate} />
      </Section>

      <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
        <Button style={styles.button} href={invoiceUrl}>Pay Now</Button>
      </Section>

      <Text style={styles.text}>
        Already paid? Please disregard this notice — your account will be updated within one
        business day.
      </Text>
    </EmailShell>
  )
}

export default PaymentReminderEmail

export const template = {
  component: PaymentReminderEmail,
  subject: (d: Props) =>
    (d?.daysUntilDue ?? 0) < 0
      ? `OVERDUE: Invoice ${d?.invoiceNumber ?? ''}`
      : `Reminder: Invoice ${d?.invoiceNumber ?? ''} due soon`,
  displayName: 'Payment Reminder / Overdue',
  previewData: {
    companyName: 'Acme Ltd',
    invoiceNumber: 'INV-00042',
    amountDue: 187,
    currency: 'USD',
    dueDate: '2026-08-04',
    daysUntilDue: 3,
    invoiceUrl: BRAND.siteUrl + '/invoices',
  },
} satisfies TemplateEntry
