import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export { TITLES, greeting } from '@/lib/titles'
export type { Title } from '@/lib/titles'

// Corporate transactional shell. The branded banner and compact contact footer
// are intentionally table-based for reliable rendering in Gmail and Outlook.

export const BRAND = {
  name: 'IMT Solutions',
  tagline: 'Your Trusted Partner for Business Technologies',
  /** Primary brand blue (from the IMT Solutions mark). `teal` kept as alias. */
  primary: '#1F6BE0',
  teal: '#1F6BE0',
  tealDark: '#1550AE',
  navy: '#16233F',
  ink: '#0B1220',
  body: '#3B4658',
  mute: '#6B7280',
  faint: '#9AA3B2',
  soft: '#F7F8FA',
  border: '#E6E8EC',
  hair: '#EFF1F5',
  supportEmail: 'support@imtsolutions.co.zw',
  supportPhone: '+263 (0) 8677 000 000',
  accountManagerPhone: '+263 86 12 004321',
  address: 'IMT Solutions, Harare, Zimbabwe',
  siteUrl: 'https://management.imtsolutions.co.zw',
  logoUrl:
    'https://management.imtsolutions.co.zw/__l5e/assets-v1/97880e6d-84db-4b70-99fe-3b27a1da5f49/imt-solutions-logo.png',
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const styles = {
  main: { backgroundColor: '#EEF2F7', fontFamily: FONT, margin: 0, padding: '28px 0' },
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '6px',
    border: `1px solid ${BRAND.border}`,
    overflow: 'hidden' as const,
  },

  // Header — a robust table-based banner for Outlook, Gmail and mobile clients.
  brandBar: { height: '6px', lineHeight: '6px', fontSize: 0, backgroundColor: '#50B6E8' },
  banner: { width: '100%', borderCollapse: 'collapse' as const, backgroundColor: BRAND.navy },
  bannerLogoCell: { width: '43%', backgroundColor: '#ffffff', padding: '28px 26px' },
  bannerMessageCell: {
    width: '57%',
    backgroundColor: BRAND.primary,
    borderLeft: '9px solid #50B6E8',
    padding: '24px 28px',
  },
  bannerEyebrow: {
    color: '#D9EDFF',
    fontSize: '10px',
    lineHeight: '14px',
    fontWeight: 700 as const,
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    margin: '0 0 8px',
  },
  bannerTitle: {
    color: '#ffffff',
    fontSize: '20px',
    lineHeight: '26px',
    fontWeight: 700 as const,
    margin: 0,
  },
  header: { padding: '0' },
  headerLogo: { display: 'block', border: 0, outline: 'none', textDecoration: 'none' },
  headerBrand: {
    color: BRAND.ink,
    fontSize: '15px',
    fontWeight: 700 as const,
    letterSpacing: '-0.01em',
    margin: 0,
  },
  headerTagline: {
    color: BRAND.faint,
    fontSize: '11px',
    letterSpacing: '0.06em',
    margin: '10px 0 0',
  },
  headerAccent: {
    display: 'inline-block',
    width: '22px',
    height: '3px',
    backgroundColor: BRAND.primary,
    borderRadius: '2px',
    margin: '14px 0 0',
  },

  // Hero — typographic only, on white
  hero: { padding: '30px 42px 6px' },
  heroKicker: {
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    color: BRAND.teal,
    fontWeight: 700 as const,
    margin: '0 0 14px',
  },
  heroTitle: {
    fontSize: '26px',
    lineHeight: '34px',
    fontWeight: 700 as const,
    letterSpacing: '-0.02em',
    color: BRAND.ink,
    margin: 0,
  },
  heroSub: {
    marginTop: '10px',
    fontSize: '15px',
    color: BRAND.mute,
    lineHeight: '24px',
  },

  content: { padding: '20px 42px 12px' },
  h2: { fontSize: '15px', fontWeight: 600 as const, color: BRAND.ink, margin: '0 0 10px' },
  text: { fontSize: '15px', color: BRAND.body, lineHeight: '24px', margin: '0 0 16px' },

  // Card — subtle hairline, no fill
  card: {
    border: `1px solid ${BRAND.hair}`,
    borderRadius: '10px',
    padding: '4px 20px',
    margin: '8px 0 24px',
    backgroundColor: '#ffffff',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: 700 as const,
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    color: BRAND.faint,
    margin: '16px 0 4px',
  },

  // Detail rows — inline, right-aligned value (Stripe receipt style)
  row: {
    fontSize: '14px',
    color: BRAND.ink,
    margin: 0,
    padding: '12px 0',
    borderBottom: `1px solid ${BRAND.hair}`,
    lineHeight: '20px',
  },
  rowLabel: { color: BRAND.mute, display: 'inline-block', minWidth: '140px', fontWeight: 400 as const },
  rowValue: { color: BRAND.ink, fontWeight: 500 as const },

  // Button — solid teal, small radius, tight padding
  button: {
    backgroundColor: BRAND.ink,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500 as const,
    borderRadius: '8px',
    padding: '11px 20px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  buttonPrimary: {
    backgroundColor: BRAND.teal,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500 as const,
    borderRadius: '8px',
    padding: '11px 20px',
    textDecoration: 'none',
    display: 'inline-block',
  },

  // Code / activation box
  codeBox: {
    border: `1px dashed ${BRAND.border}`,
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center' as const,
    margin: '8px 0 20px',
    backgroundColor: BRAND.soft,
    fontFamily: '"SF Mono", "Menlo", "Consolas", monospace',
    fontSize: '18px',
    fontWeight: 600 as const,
    letterSpacing: '3px',
    color: BRAND.ink,
  },

  divider: { borderColor: BRAND.hair, margin: '26px 42px 0', borderTop: `1px solid ${BRAND.hair}` },

  // Footer — sender details are folded into one branded band, avoiding a
  // separate signature block and the repeated logo/contact sections it caused.
  footer: { padding: '0', backgroundColor: BRAND.navy },
  footerTable: { width: '100%', borderCollapse: 'collapse' as const },
  footerContactCell: { width: '58%', padding: '24px 18px 24px 42px', verticalAlign: 'middle' as const },
  footerLogoCell: { width: '42%', padding: '24px 42px 24px 12px', verticalAlign: 'middle' as const },
  footerName: { fontSize: '15px', color: '#ffffff', lineHeight: '21px', fontWeight: 700 as const, margin: 0 },
  footerRole: { fontSize: '11px', color: '#8ED6F5', lineHeight: '17px', fontWeight: 600 as const, margin: '2px 0 9px' },
  footerText: { fontSize: '11px', color: '#D7E0ED', lineHeight: '18px', margin: 0 },
  footerLink: { color: '#ffffff', textDecoration: 'none' },
  footerLogoBox: { backgroundColor: '#ffffff', padding: '12px', textAlign: 'center' as const },
  footerLogo: { display: 'block', margin: '0 auto', border: 0 },
  footerSite: { fontSize: '10px', color: '#AFC2D9', lineHeight: '16px', textAlign: 'center' as const, margin: '8px 0 0' },
  legal: { padding: '18px 42px 22px', backgroundColor: '#F4F7FB' },
  footerLegal: { fontSize: '10px', color: BRAND.mute, lineHeight: '16px', margin: '0 0 10px' },
  disclaimer: {
    fontSize: '9px',
    color: '#7B8798',
    lineHeight: '14px',
    margin: 0,
  },
}

export function EmailShell({
  preview,
  kicker,
  title,
  subtitle,
  senderName,
  senderRole,
  senderEmail,
  senderPhone,
  children,
}: {
  preview: string
  kicker?: string
  title: string
  subtitle?: string
  senderName?: string
  senderRole?: string
  senderEmail?: string
  senderPhone?: string
  children: React.ReactNode
}) {
  const signatureName = senderName || `${BRAND.name} Team`
  const signatureRole = senderRole || (senderName ? 'Account Manager' : 'Business Technology Solutions')
  const signatureEmail = senderEmail || BRAND.supportEmail
  const signaturePhone = senderPhone || BRAND.accountManagerPhone

  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.brandBar}>&nbsp;</Section>
          <Section style={styles.header}>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={styles.banner}>
              <tbody>
                <tr>
                  <td style={styles.bannerLogoCell}>
                    <Img
                      src={BRAND.logoUrl}
                      alt={BRAND.name}
                      width="178"
                      height="41"
                      style={styles.headerLogo}
                    />
                  </td>
                  <td style={styles.bannerMessageCell}>
                    <Text style={styles.bannerEyebrow}>Connect · Protect · Grow</Text>
                    <Text style={styles.bannerTitle}>Technology that keeps business moving.</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={styles.hero}>
            {kicker && <Text style={styles.heroKicker}>{kicker}</Text>}
            <Heading style={styles.heroTitle}>{title}</Heading>
            {subtitle && <Text style={styles.heroSub}>{subtitle}</Text>}
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Hr style={styles.divider} />
          <Section style={styles.footer}>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={styles.footerTable}>
              <tbody>
                <tr>
                  <td style={styles.footerContactCell}>
                    <Text style={styles.footerName}>{signatureName}</Text>
                    <Text style={styles.footerRole}>{signatureRole} · {BRAND.name}</Text>
                    <Text style={styles.footerText}>{signaturePhone}</Text>
                    <Text style={styles.footerText}>
                      <Link href={`mailto:${signatureEmail}`} style={styles.footerLink}>{signatureEmail}</Link>
                    </Text>
                  </td>
                  <td style={styles.footerLogoCell}>
                    <div style={styles.footerLogoBox}>
                      <Img src={BRAND.logoUrl} alt={BRAND.name} width="150" height="35" style={styles.footerLogo} />
                    </div>
                    <Text style={styles.footerSite}>
                      <Link href={BRAND.siteUrl} style={{ ...styles.footerLink, color: '#AFC2D9' }}>
                        imtsolutions.co.zw
                      </Link>
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
          <Section style={styles.legal}>
            <Text style={styles.footerLegal}>
              {BRAND.address} · © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}.
            </Text>
            <Text style={styles.disclaimer}>
              CONFIDENTIALITY NOTICE: This email and its attachments are intended solely for the named recipient
              and may contain confidential, privileged or copyright information. If you received it in error,
              please notify the sender, delete it, and do not copy, share or act on its contents. Email transmission
              cannot be guaranteed secure or error-free; please scan attachments before opening them.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <Text style={styles.row}>
      <span style={styles.rowLabel}>{label}</span>
      <span style={{ ...styles.rowValue, float: 'right' }}>{value}</span>
    </Text>
  )
}
