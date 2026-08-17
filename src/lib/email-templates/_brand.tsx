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
import { greeting } from '@/lib/titles'

// Stripe / Linear / Vercel–inspired minimal transactional shell.
// White canvas, generous whitespace, single teal accent, hairline dividers,
// typographic hierarchy instead of coloured hero blocks.

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
  address: 'IMT Solutions, Harare, Zimbabwe',
  siteUrl: 'https://management.imtsolutions.co.zw',
  logoUrl:
    'https://management.imtsolutions.co.zw/__l5e/assets-v1/97880e6d-84db-4b70-99fe-3b27a1da5f49/imt-solutions-logo.png',
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'

export const styles = {
  main: { backgroundColor: '#F4F5F7', fontFamily: FONT, margin: 0, padding: '32px 0' },
  container: {
    maxWidth: '560px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    borderRadius: '12px',
    border: `1px solid ${BRAND.border}`,
    overflow: 'hidden' as const,
  },

  // Header — brand bar + logo lockup
  brandBar: { height: '4px', lineHeight: '4px', fontSize: 0, backgroundColor: BRAND.primary },
  header: { padding: '26px 40px 6px' },
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
  hero: { padding: '20px 40px 8px' },
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

  content: { padding: '20px 40px 8px' },
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

  divider: { borderColor: BRAND.hair, margin: '24px 0 0', borderTop: `1px solid ${BRAND.hair}` },

  // Footer
  footer: { padding: '24px 40px 32px' },
  footerText: { fontSize: '12px', color: BRAND.mute, lineHeight: '20px', margin: '0 0 4px' },
  footerLink: { color: BRAND.ink, textDecoration: 'underline' },
  footerLegal: { fontSize: '11px', color: BRAND.faint, lineHeight: '18px', margin: '14px 0 0' },
}

export function EmailShell({
  preview,
  kicker,
  title,
  subtitle,
  children,
}: {
  preview: string
  kicker?: string
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.main}>
        <Container style={styles.container}>
          <Section style={styles.brandBar}>&nbsp;</Section>
          <Section style={styles.header}>
            <Img
              src={BRAND.logoUrl}
              alt={BRAND.name}
              width="196"
              height="45"
              style={styles.headerLogo}
            />
            <Text style={styles.headerTagline}>{BRAND.tagline}</Text>
          </Section>
          <Section style={styles.hero}>
            {kicker && <Text style={styles.heroKicker}>{kicker}</Text>}
            <Heading style={styles.heroTitle}>{title}</Heading>
            {subtitle && <Text style={styles.heroSub}>{subtitle}</Text>}
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Hr style={styles.divider} />
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              Questions? Reply to this email, write to{' '}
              <Link href={`mailto:${BRAND.supportEmail}`} style={styles.footerLink}>
                {BRAND.supportEmail}
              </Link>{' '}
              or call {BRAND.supportPhone}.
            </Text>
            <Text style={styles.footerText}>
              <Link href={BRAND.siteUrl} style={styles.footerLink}>
                {BRAND.siteUrl.replace('https://', '')}
              </Link>
            </Text>
            <Text style={styles.footerLegal}>
              {BRAND.address} · © {new Date().getFullYear()} {BRAND.name}. {BRAND.tagline}.
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
