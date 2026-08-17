import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  title?: string
  ticketNumber?: string
  subject?: string
  status?: string
  priority?: string
  updateNote?: string
  agentName?: string
  ticketUrl?: string
}

const statusColor = (s?: string) => {
  const v = (s || '').toLowerCase()
  if (v === 'resolved' || v === 'closed') return '#16a34a'
  if (v === 'in_progress' || v === 'in progress') return BRAND.teal
  if (v === 'waiting') return '#f59e0b'
  return BRAND.mute
}

export const TicketUpdateEmail = ({
  companyName = '',
  title,
  ticketNumber = '—',
  subject = 'Your support request',
  status = 'open',
  priority,
  updateNote,
  agentName,
  ticketUrl = BRAND.siteUrl,
}: Props) => (
  <EmailShell
    preview={`Ticket ${ticketNumber}: ${status}`}
    kicker={`Ticket ${status.toUpperCase()}`}
    title={subject}
    subtitle={`Ticket ${ticketNumber} — Status updated to ${status}`}
  >
    <Text style={styles.text}>{greeting(title, companyName)}</Text>
    <Text style={styles.text}>
      There's an update on your support request. Full details are below.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Ticket Details</Text>
      <DetailRow label="Ticket Number" value={ticketNumber} />
      <DetailRow label="Subject" value={subject} />
      <DetailRow label="Priority" value={priority} />
      <Text style={styles.row}>
        <span style={styles.rowLabel}>Status</span>
        <span style={{ ...styles.rowValue, color: statusColor(status), textTransform: 'capitalize' }}>{status}</span>
      </Text>
      <DetailRow label="Assigned To" value={agentName} />
    </Section>

    {updateNote && (
      <Section style={styles.card}>
        <Text style={styles.cardTitle}>Latest Update</Text>
        <Text style={{ ...styles.row, whiteSpace: 'pre-wrap' }}>{updateNote}</Text>
      </Section>
    )}

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={ticketUrl}>View Ticket</Button>
    </Section>
  </EmailShell>
)

export default TicketUpdateEmail

export const template = {
  component: TicketUpdateEmail,
  subject: (d: Props) => `[${d?.ticketNumber ?? 'Ticket'}] ${d?.subject ?? 'Update'} — ${d?.status ?? ''}`,
  displayName: 'Ticket Update',
  previewData: {
    companyName: 'Acme Ltd',
    ticketNumber: 'TKT-00087',
    subject: 'Email not sending from Outlook',
    status: 'in_progress',
    priority: 'high',
    updateNote: 'We identified the issue with your DNS records and are applying a fix. ETA 1 hour.',
    agentName: 'Farai Matare',
    ticketUrl: BRAND.siteUrl + '/tickets',
  },
} satisfies TemplateEntry
