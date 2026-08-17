import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, greeting, styles } from './_brand'

interface Props {
  companyName?: string
  recipientTitle?: string
  serverName?: string
  provider?: string
  ipAddress?: string
  region?: string
  plan?: string
  credentialsUrl?: string
  controlPanelUrl?: string
}

export const ServerReadyEmail = ({
  companyName = '',
  recipientTitle,
  serverName = 'your server',
  provider,
  ipAddress,
  region,
  plan,
  credentialsUrl = BRAND.siteUrl,
  controlPanelUrl,
}: Props) => (
  <EmailShell
    preview={`${serverName} is provisioned and ready`}
    kicker="Server Ready"
    title="Your server is live"
    subtitle="Provisioning completed successfully. Below are your access details."
  >
    <Text style={styles.text}>{greeting(recipientTitle, companyName)}</Text>
    <Text style={styles.text}>
      Your new cloud server has been provisioned and is ready to use. Root credentials have
      been generated automatically and securely stored in your credentials vault.
    </Text>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>Server Details</Text>
      <DetailRow label="Name" value={serverName} />
      <DetailRow label="Provider" value={provider} />
      <DetailRow label="Region" value={region} />
      <DetailRow label="Plan" value={plan} />
      <DetailRow label="IP Address" value={ipAddress} />
      <DetailRow label="Status" value="Online" />
    </Section>

    <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
      <Button style={styles.button} href={credentialsUrl}>View Credentials</Button>
    </Section>

    {controlPanelUrl && (
      <Text style={styles.text}>
        Control panel: <a href={controlPanelUrl} style={{ color: BRAND.teal }}>{controlPanelUrl}</a>
      </Text>
    )}

    <Text style={styles.text}>
      For security, we recommend rotating the root password after your first login and enabling
      SSH key authentication. Our team monitors the server 24/7 — any alerts will be routed to
      your account manager.
    </Text>
  </EmailShell>
)

export default ServerReadyEmail

export const template = {
  component: ServerReadyEmail,
  subject: (d: Props) => `Server ready: ${d?.serverName ?? ''}`.trim(),
  displayName: 'Server Provisioned / Handover',
  previewData: {
    companyName: 'Acme Ltd',
    serverName: 'acme-web-01',
    provider: 'Vultr',
    ipAddress: '203.0.113.42',
    region: 'Johannesburg',
    plan: '2 vCPU · 4 GB RAM · 80 GB SSD',
    credentialsUrl: BRAND.siteUrl + '/credentials',
  },
} satisfies TemplateEntry
