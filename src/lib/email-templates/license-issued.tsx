import * as React from 'react'
import { Button, Section, Text } from '@react-email/components'
import type { TemplateEntry } from './registry'
import { BRAND, DetailRow, EmailShell, styles } from './_brand'

interface Props {
  companyName?: string
  productName?: string
  activationCode?: string
  seats?: number
  expiresOn?: string
  downloadUrl?: string
  instructionsUrl?: string
}

export const LicenseIssuedEmail = ({
  companyName = 'there',
  productName = 'Your license',
  activationCode = 'XXXX-XXXX-XXXX-XXXX',
  seats,
  expiresOn,
  downloadUrl,
  instructionsUrl,
}: Props) => (
  <EmailShell
    preview={`Your ${productName} activation code`}
    kicker="License Issued"
    title={`Get ready to activate ${productName}`}
    subtitle="Your activation code is ready. Details below."
  >
    <Text style={styles.text}>Dear {companyName},</Text>
    <Text style={styles.text}>
      Thank you for your order. Your license has been issued. Use the activation code below during
      product setup.
    </Text>

    <Section>
      <Text style={{ ...styles.cardTitle, textAlign: 'center' }}>Activation Code</Text>
      <Text style={styles.codeBox}>{activationCode}</Text>
    </Section>

    <Section style={styles.card}>
      <Text style={styles.cardTitle}>License Details</Text>
      <DetailRow label="Product" value={productName} />
      <DetailRow label="Seats / Devices" value={seats} />
      <DetailRow label="Expires On" value={expiresOn} />
    </Section>

    {downloadUrl && (
      <Section style={{ textAlign: 'center', margin: '10px 0 24px' }}>
        <Button style={styles.button} href={downloadUrl}>Download & Install</Button>
      </Section>
    )}

    {instructionsUrl && (
      <Text style={styles.text}>
        Step-by-step setup: <a href={instructionsUrl} style={{ color: BRAND.teal }}>{instructionsUrl}</a>
      </Text>
    )}

    <Text style={styles.text}>
      Keep this email safe — you'll need the activation code if you ever re-install. Our team is
      on hand if you need help getting set up.
    </Text>
  </EmailShell>
)

export default LicenseIssuedEmail

export const template = {
  component: LicenseIssuedEmail,
  subject: (d: Props) => `Your ${d?.productName ?? 'license'} is ready to activate`,
  displayName: 'License / Activation Code',
  previewData: {
    companyName: 'Acme Ltd',
    productName: 'Kaspersky Endpoint Security for Business',
    activationCode: '16AZ7-1VUJX-QSSD6-W4FQX',
    seats: 25,
    expiresOn: '2027-07-20',
    downloadUrl: 'https://www.kaspersky.com/downloads',
  },
} satisfies TemplateEntry
