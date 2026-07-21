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

// Kaspersky-inspired branded shell for all IMT transactional emails.
// Teal accent + white body + navy header, boxed content cards.

export const BRAND = {
  name: 'IMT Solutions',
  tagline: 'Cloud · Cybersecurity · Managed IT',
  teal: '#00A88E',
  tealDark: '#008E78',
  navy: '#0B1E3F',
  ink: '#0f172a',
  mute: '#64748b',
  soft: '#f6f8fb',
  border: '#e5e9f0',
  supportEmail: 'support@imtsolutions.co.zw',
  supportPhone: '+263 (0) 8677 000 000',
  address: 'IMT Solutions, Harare, Zimbabwe',
  siteUrl: 'https://management.imtsolutions.co.zw',
  logoUrl: 'https://management.imtsolutions.co.zw/favicon.ico',
}

export const styles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: 0 },
  container: { maxWidth: '600px', margin: '0 auto', backgroundColor: '#ffffff' },
  header: {
    backgroundColor: BRAND.navy,
    padding: '18px 28px',
  },
  headerBrand: { color: '#ffffff', fontSize: '18px', fontWeight: 700 as const, letterSpacing: '0.5px', margin: 0 },
  headerTag: { color: '#9db1d3', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' as const, margin: '4px 0 0' },
  hero: {
    background: `linear-gradient(135deg, ${BRAND.teal} 0%, ${BRAND.tealDark} 100%)`,
    padding: '44px 32px 40px',
    color: '#ffffff',
  },
  heroKicker: {
    fontSize: '11px',
    letterSpacing: '3px',
    textTransform: 'uppercase' as const,
    color: 'rgba(255,255,255,0.85)',
    margin: '0 0 10px',
  },
  heroTitle: { fontSize: '30px', lineHeight: '36px', fontWeight: 700 as const, margin: 0, color: '#ffffff' },
  heroSub: { marginTop: '10px', fontSize: '14px', color: 'rgba(255,255,255,0.92)', lineHeight: '20px' },
  content: { padding: '32px 32px 8px' },
  h2: { fontSize: '18px', fontWeight: 700 as const, color: BRAND.ink, margin: '0 0 12px' },
  text: { fontSize: '14px', color: '#334155', lineHeight: '22px', margin: '0 0 14px' },
  card: {
    border: `1px solid ${BRAND.border}`,
    borderRadius: '10px',
    padding: '18px 20px',
    margin: '10px 0 22px',
    backgroundColor: BRAND.soft,
  },
  cardTitle: { fontSize: '12px', fontWeight: 700 as const, letterSpacing: '1px', textTransform: 'uppercase' as const, color: BRAND.mute, margin: '0 0 12px' },
  row: { fontSize: '14px', color: BRAND.ink, margin: '0 0 8px', lineHeight: '20px' },
  rowLabel: { color: BRAND.mute, display: 'inline-block', minWidth: '140px' },
  rowValue: { color: BRAND.ink, fontWeight: 600 as const },
  button: {
    backgroundColor: BRAND.teal,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 700 as const,
    borderRadius: '8px',
    padding: '14px 28px',
    textDecoration: 'none',
    display: 'inline-block',
  },
  codeBox: {
    border: `2px solid ${BRAND.teal}`,
    borderRadius: '10px',
    padding: '22px',
    textAlign: 'center' as const,
    margin: '18px 0',
    backgroundColor: '#ffffff',
    fontSize: '22px',
    fontWeight: 700 as const,
    letterSpacing: '2px',
    color: BRAND.ink,
  },
  divider: { borderColor: BRAND.border, margin: '24px 0' },
  footer: { padding: '24px 32px 32px', backgroundColor: BRAND.soft },
  footerText: { fontSize: '12px', color: BRAND.mute, lineHeight: '18px', margin: '0 0 6px' },
  footerLink: { color: BRAND.teal, textDecoration: 'none' },
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
          <Section style={styles.header}>
            <Text style={styles.headerBrand}>{BRAND.name}</Text>
            <Text style={styles.headerTag}>{BRAND.tagline}</Text>
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
              Need help? Email{' '}
              <Link href={`mailto:${BRAND.supportEmail}`} style={styles.footerLink}>
                {BRAND.supportEmail}
              </Link>{' '}
              or call {BRAND.supportPhone}.
            </Text>
            <Text style={styles.footerText}>
              {BRAND.address} · <Link href={BRAND.siteUrl} style={styles.footerLink}>{BRAND.siteUrl.replace('https://', '')}</Link>
            </Text>
            <Text style={{ ...styles.footerText, marginTop: '10px' }}>
              © {new Date().getFullYear()} {BRAND.name}. All rights reserved.
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
      <span style={styles.rowValue}>{value}</span>
    </Text>
  )
}
