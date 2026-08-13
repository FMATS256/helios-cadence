import * as React from 'react'
import { Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, EmailShell, styles } from './_brand'

interface Props {
  subject?: string
  message?: string
  recipientName?: string
  senderName?: string
}

export const GeneralMessageEmail = ({
  subject = 'A message from ' + BRAND.name,
  message = '',
  recipientName,
  senderName,
}: Props) => (
  <EmailShell
    preview={subject}
    kicker="Message"
    title={subject}
    subtitle={`From the ${BRAND.name} team`}
  >
    {recipientName && <Text style={styles.text}>Dear {recipientName},</Text>}
    <Section style={styles.card}>
      {String(message)
        .split(/\n{2,}/)
        .filter(Boolean)
        .map((para, i) => (
          <Text key={i} style={styles.text}>
            {para}
          </Text>
        ))}
    </Section>
    <Text style={styles.text}>
      {senderName ? `${senderName} — ${BRAND.name}` : `${BRAND.name} Team`}
    </Text>
  </EmailShell>
)

export default GeneralMessageEmail

export const template = {
  component: GeneralMessageEmail,
  subject: (d: Props) => d?.subject || `A message from ${BRAND.name}`,
  displayName: 'General message (Communications)',
  previewData: {
    subject: 'Scheduled maintenance this weekend',
    recipientName: 'Acme Ltd',
    senderName: 'Farai Matare',
    message:
      'We will be performing scheduled maintenance on Saturday between 22:00 and 02:00.\n\nNo action is required from your side. Please contact support if you notice any disruption.',
  },
} satisfies TemplateEntry
