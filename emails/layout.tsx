import type { ReactNode } from 'react'
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from '@react-email/components'

// Brand: black, premium gold #B88746, thin gold rules. Inline styles only – email clients
// ignore stylesheets. The wordmark is text because SVG logos do not render in Gmail/Outlook.
export const GOLD = '#B88746'
const FONT = 'Montserrat, "Helvetica Neue", Arial, Helvetica, sans-serif'

export const styles = {
  h1: { margin: '0', fontSize: '22px', lineHeight: '30px', fontWeight: 700, color: '#ffffff' },
  h2: { margin: '0 0 8px', fontSize: '12px', lineHeight: '18px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' as const, color: GOLD },
  p: { margin: '0 0 12px', fontSize: '15px', lineHeight: '24px', color: '#CCCCCC' },
  small: { margin: '0', fontSize: '13px', lineHeight: '20px', color: '#AAAAAA' },
  label: { padding: '6px 12px 6px 0', fontSize: '14px', lineHeight: '20px', color: '#AAAAAA', verticalAlign: 'top' as const },
  value: { padding: '6px 0', fontSize: '14px', lineHeight: '20px', color: '#ffffff', textAlign: 'right' as const, verticalAlign: 'top' as const },
  button: { display: 'inline-block', backgroundColor: GOLD, color: '#ffffff', textDecoration: 'none', fontWeight: 600, fontSize: '15px', padding: '13px 28px', borderRadius: '8px' },
  link: { color: GOLD, textDecoration: 'underline' },
  rule: { borderColor: GOLD, borderTopWidth: '1px', opacity: 0.6, margin: '24px 0' },
  thinRule: { borderColor: '#333333', borderTopWidth: '1px', margin: '8px 0' },
}

export type EmailCompany = { name: string; address: string; phone: string | null; email: string | null }

export function EmailLayout({ locale, preview, company, children }: { locale: string; preview: string; company: EmailCompany; children: ReactNode }) {
  return (
    <Html lang={locale === 'en' ? 'en' : 'sk'}>
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: '32px 12px', backgroundColor: '#111111', fontFamily: FONT, color: '#ffffff' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', backgroundColor: '#1A1A1A', border: `1px solid ${GOLD}`, borderRadius: '12px' }}>
          <Section style={{ padding: '32px 32px 0' }}>
            <Text style={{ margin: 0, fontSize: '14px', letterSpacing: '4px', fontWeight: 700, color: GOLD }}>BY THE WAVE</Text>
            <Hr style={{ ...styles.rule, margin: '16px 0 0' }} />
          </Section>
          <Section style={{ padding: '24px 32px 32px' }}>{children}</Section>
        </Container>
        <Text style={{ margin: '16px auto 0', maxWidth: '600px', textAlign: 'center', fontSize: '12px', lineHeight: '18px', color: '#999999' }}>
          {[company.name, company.address, company.phone, company.email].filter(Boolean).join(' · ')}
        </Text>
      </Body>
    </Html>
  )
}

/** Two-column list of label / value rows. */
export function Rows({ rows }: { rows: { label: string; value: ReactNode; strong?: boolean }[] }) {
  return (
    <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderCollapse: 'collapse' }}>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}>
            <td style={{ ...styles.label, ...(row.strong ? { color: '#ffffff', fontWeight: 700, fontSize: '16px', paddingTop: '10px' } : {}) }}>{row.label}</td>
            <td style={{ ...styles.value, ...(row.strong ? { fontWeight: 700, fontSize: '16px', paddingTop: '10px' } : {}) }}>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
