import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, styles } from './_brand'

interface Metric {
  label?: string
  value?: string
}

interface Props {
  period?: string
  cadence?: string
  metrics?: Metric[]
  generatedAt?: string
}

export const OpsDigestEmail = ({
  period = '',
  cadence = 'daily',
  metrics = [],
  generatedAt,
}: Props) => (
  <EmailShell
    preview={`Operations digest ${period}`}
    kicker="Operations Digest"
    title="Your operations summary"
    subtitle={`${cadence} summary${period ? ` · ${period}` : ''}`}
  >
    <Text style={styles.text}>
      Here is the current operational picture across billing, support and infrastructure.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Key metrics</Text>
      {(metrics ?? []).map((m, i) => (
        <DetailRow key={i} label={m?.label ?? '—'} value={m?.value ?? '—'} />
      ))}
    </Section>

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={`${BRAND.siteUrl}/reports`}>Open full reports</Button>
    </Section>

    {generatedAt && (
      <Text style={styles.text}>
        Generated {new Date(generatedAt).toLocaleString()}.
      </Text>
    )}
  </EmailShell>
)

export default OpsDigestEmail

export const template = {
  component: OpsDigestEmail,
  subject: (d: Props) => `Operations digest${d?.period ? ` — ${d.period}` : ''}`,
  displayName: 'Operations Digest',
  previewData: {
    period: '2026-08-01 → 2026-08-09',
    cadence: 'daily',
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'MRR', value: 'USD 18,420.00' },
      { label: 'Collected this month', value: 'USD 9,150.00' },
      { label: 'Outstanding receivables', value: 'USD 4,310.00' },
      { label: 'Open tickets', value: '12' },
      { label: 'SLA breaches', value: '1' },
      { label: 'Services down', value: '0' },
      { label: 'Renewals next 14 days', value: '6' },
    ],
  },
} satisfies TemplateEntry
