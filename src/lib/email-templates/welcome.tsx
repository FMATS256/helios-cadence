import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  recipientTitle?: string
  accountNumber?: string
  accountManagerName?: string
  accountManagerEmail?: string
  accountManagerPhone?: string
  services?: string[]
  portalUrl?: string
}

export const WelcomeEmail = ({
  companyName = '',
  recipientTitle,
  accountNumber = '—',
  accountManagerName,
  accountManagerEmail,
  accountManagerPhone,
  services = [],
  portalUrl = BRAND.siteUrl,
}: Props) => (
  <EmailShell
    preview={`Welcome to ${BRAND.name}, ${companyName}`}
    kicker="Account Activated"
    title={`Welcome to ${BRAND.name}`}
    subtitle="Your account is ready. Everything you need to manage your services is one click away."
  >
    <Text style={styles.text}>{greeting(recipientTitle, companyName)}</Text>
    <Text style={styles.text}>
      Thank you for choosing {BRAND.name}. We're delighted to have you on board. Below are your
      account details and your dedicated account manager's contact information.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Account Details</Text>
      <DetailRow label="Company" value={companyName} />
      <DetailRow label="Account Number" value={accountNumber} />
      <DetailRow label="Status" value="Active" />
    </Section>

    {(accountManagerName || accountManagerEmail || accountManagerPhone) && (
      <Section style={styles.card}>
        <Text style={styles.cardTitle}>Your Account Manager</Text>
        <DetailRow label="Name" value={accountManagerName} />
        <DetailRow label="Email" value={accountManagerEmail} />
        <DetailRow label="Phone" value={accountManagerPhone} />
      </Section>
    )}

    {services.length > 0 && (
      <Section style={styles.card}>
        <Text style={styles.cardTitle}>Assigned Services</Text>
        {services.map((s, i) => (
          <Text key={i} style={styles.row}>• {s}</Text>
        ))}
      </Section>
    )}

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={portalUrl}>Open Customer Portal</Button>
    </Section>

    <Text style={styles.text}>
      If you have any questions, simply reply to this email or contact your account manager directly.
      We're here to help you get the most out of your services.
    </Text>
  </EmailShell>
)

export default WelcomeEmail

export const template = {
  component: WelcomeEmail,
  subject: (d: Props) => `Welcome to ${BRAND.name} — Account ${d?.accountNumber ?? ''}`.trim(),
  displayName: 'Welcome / Account Created',
  previewData: {
    companyName: 'Acme Ltd',
    accountNumber: '10457',
    accountManagerName: 'Farai Matare',
    accountManagerEmail: 'farai@imtsolutions.co.zw',
    accountManagerPhone: '+263 77 000 0000',
    services: ['Microsoft 365 Business Standard × 10', 'Managed Cloud VPS', 'Kaspersky Endpoint Security'],
    portalUrl: BRAND.siteUrl + '/portal',
  },
} satisfies TemplateEntry
