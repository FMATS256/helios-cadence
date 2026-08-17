import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  title?: string
  planName?: string
  renewalDate?: string
  daysUntilRenewal?: number
  amount?: number
  currency?: string
  billingCycle?: string
  manageUrl?: string
}

const fmt = (n?: number, c = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: c }).format(Number(n) || 0)

export const RenewalReminderEmail = ({
  companyName = '',
  title,
  planName = 'Your subscription',
  renewalDate,
  daysUntilRenewal = 0,
  amount = 0,
  currency = 'USD',
  billingCycle = 'monthly',
  manageUrl = BRAND.siteUrl,
}: Props) => (
  <EmailShell
    preview={`${planName} renews in ${daysUntilRenewal} days`}
    kicker="Renewal Notice"
    title={`${planName} renews soon`}
    subtitle={`Auto-renewal on ${renewalDate ?? '—'} · ${fmt(amount, currency)} / ${billingCycle}`}
  >
    <Text style={styles.text}>{greeting(title, companyName)}</Text>
    <Text style={styles.text}>
      Your subscription is scheduled to renew in <strong>{daysUntilRenewal} day(s)</strong>.
      No action is required — service will continue uninterrupted and an invoice will be issued
      on the renewal date.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Renewal Summary</Text>
      <DetailRow label="Plan" value={planName} />
      <DetailRow label="Renewal Date" value={renewalDate} />
      <DetailRow label="Billing" value={`${fmt(amount, currency)} / ${billingCycle}`} />
    </Section>

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={manageUrl}>Manage Subscription</Button>
    </Section>

    <Text style={styles.text}>
      Want to upgrade, downgrade, or cancel? Reply to this email or contact your account manager
      before the renewal date.
    </Text>
  </EmailShell>
)

export default RenewalReminderEmail

export const template = {
  component: RenewalReminderEmail,
  subject: (d: Props) => `Renewal reminder: ${d?.planName ?? ''}`,
  displayName: 'Renewal Reminder',
  previewData: {
    companyName: 'Acme Ltd',
    planName: 'Microsoft 365 Business Standard',
    renewalDate: '2026-08-19',
    daysUntilRenewal: 30,
    amount: 125,
    currency: 'USD',
    billingCycle: 'monthly',
    manageUrl: BRAND.siteUrl + '/subscriptions',
  },
} satisfies TemplateEntry
