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
  marketingUrl: 'https://imtsolutions.co.zw',
  logoUrl:
    'https://management.imtsolutions.co.zw/__l5e/assets-v1/97880e6d-84db-4b70-99fe-3b27a1da5f49/imt-solutions-logo.png',
  bannerUrl:
    'https://management.imtsolutions.co.zw/__l5e/assets-v1/f314eeab-7375-4951-81de-efc0c2372913/imt-hero-banner.jpg',
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
  banner: { width: '100%', borderCollapse: 'collapse' as const, backgroundColor: BRAND.primary },
  bannerLogoCell: { width: '42%', backgroundColor: '#ffffff', padding: '30px 28px' },
  bannerMessageCell: {
    width: '58%',
    backgroundColor: BRAND.primary,
    borderLeft: '10px solid #50B6E8',
    padding: '25px 30px',
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
    fontSize: '21px',
    lineHeight: '27px',
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

  content: { padding: '34px 42px 14px' },
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

  divider: { borderColor: BRAND.hair, margin: '24px 42px 0', borderTop: `1px solid ${BRAND.hair}` },

  // Reference-led signature: a slim icon rail, strong identity block,
  // legal copy and the branded image-style panel in that exact order.
  footer: { padding: '26px 42px 24px', backgroundColor: '#ffffff' },
  signatureTable: { width: '100%', borderCollapse: 'collapse' as const },
  signatureRailCell: {
    width: '42px',
    padding: '0 12px 0 0',
    borderRight: `2px solid ${BRAND.navy}`,
    verticalAlign: 'top' as const,
    textAlign: 'center' as const,
  },
  signatureDetailsCell: { padding: '0 0 0 16px', verticalAlign: 'top' as const },
  railIcon: {
    width: '24px',
    height: '24px',
    lineHeight: '24px',
    borderRadius: '50%',
    backgroundColor: BRAND.navy,
    color: '#ffffff',
    fontSize: '12px',
    fontWeight: 700 as const,
    textAlign: 'center' as const,
    margin: '0 auto 7px',
  },
  footerName: { fontSize: '19px', color: BRAND.ink, lineHeight: '23px', fontWeight: 700 as const, margin: '0 0 2px' },
  footerRole: { fontSize: '13px', color: BRAND.primary, lineHeight: '19px', fontWeight: 600 as const, margin: '0 0 8px' },
  footerText: { fontSize: '12px', color: BRAND.body, lineHeight: '19px', margin: 0 },
  footerLabel: { color: BRAND.primary, fontWeight: 700 as const },
  footerLink: { color: BRAND.primary, textDecoration: 'none' },
  signatureDisclaimer: {
    borderTop: `1px solid ${BRAND.hair}`,
    color: '#7B8798',
    fontSize: '9px',
    lineHeight: '14px',
    margin: '18px 0 0',
    padding: '13px 0 0',
  },
  signatureBanner: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: BRAND.primary,
    marginTop: '16px',
    borderRadius: '22px',
    overflow: 'hidden' as const,
  },
  signatureBannerLogoCell: { width: '43%', padding: '20px', backgroundColor: '#ffffff', verticalAlign: 'middle' as const },
  signatureBannerMessageCell: { width: '57%', padding: '19px 22px', backgroundColor: BRAND.primary, verticalAlign: 'middle' as const },
  footerLogo: { display: 'block', border: 0, outline: 'none' },
  bannerCallout: { color: '#ffffff', fontSize: '16px', lineHeight: '21px', fontWeight: 700 as const, margin: 0 },
  bannerSub: { color: '#D9EDFF', fontSize: '10px', lineHeight: '15px', fontWeight: 600 as const, margin: '5px 0 0' },
  footerCta: {
    border: `2px solid ${BRAND.navy}`,
    borderRadius: '18px',
    color: BRAND.navy,
    fontSize: '11px',
    lineHeight: '15px',
    fontWeight: 700 as const,
    textAlign: 'center' as const,
    padding: '7px 14px',
    margin: '14px 0 0',
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
          <Section style={styles.content}>{children}</Section>
          <Hr style={styles.divider} />
          <Section style={styles.footer}>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={styles.signatureTable}>
              <tbody>
                <tr>
                  <td style={styles.signatureRailCell}>
                    <div style={styles.railIcon}>●</div>
                    <div style={styles.railIcon}>@</div>
                    <div style={styles.railIcon}>☎</div>
                    <div style={{ ...styles.railIcon, marginBottom: 0 }}>⌖</div>
                  </td>
                  <td style={styles.signatureDetailsCell}>
                    <Text style={styles.footerName}>{signatureName}</Text>
                    <Text style={styles.footerRole}>{signatureRole} · {BRAND.name}</Text>
                    <Text style={styles.footerText}>
                      <span style={styles.footerLabel}>w: </span>
                      <Link href={BRAND.siteUrl} style={styles.footerLink}>imtsolutions.co.zw</Link>
                      <span style={{ color: BRAND.faint }}> · </span>
                      <span style={styles.footerLabel}>e: </span>
                      <Link href={`mailto:${signatureEmail}`} style={styles.footerLink}>{signatureEmail}</Link>
                    </Text>
                    <Text style={styles.footerText}>
                      <span style={styles.footerLabel}>m: </span>{signaturePhone}
                    </Text>
                    <Text style={styles.footerText}>
                      <span style={styles.footerLabel}>a: </span>{BRAND.address}
                    </Text>
                  </td>
                </tr>
              </tbody>
            </table>
            <Text style={styles.signatureDisclaimer}>
              CONFIDENTIALITY NOTICE: This email and its attachments are intended solely for the named recipient
              and may contain confidential, privileged or copyright information. If you received it in error,
              please notify the sender, delete it, and do not copy, share or act on its contents. Email transmission
              cannot be guaranteed secure or error-free; please scan attachments before opening them. © {new Date().getFullYear()} {BRAND.name}.
            </Text>
            <table role="presentation" cellPadding="0" cellSpacing="0" style={styles.signatureBanner}>
              <tbody>
                <tr>
                  <td style={styles.signatureBannerLogoCell}>
                    <Img src={BRAND.logoUrl} alt={BRAND.name} width="150" height="35" style={styles.footerLogo} />
                  </td>
                  <td style={styles.signatureBannerMessageCell}>
                    <Text style={styles.bannerCallout}>Connect. Protect. Grow.</Text>
                    <Text style={styles.bannerSub}>Business technology that keeps you moving.</Text>
                  </td>
                </tr>
              </tbody>
            </table>
            <Text style={styles.footerCta}>Your trusted partner for business technologies</Text>
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
