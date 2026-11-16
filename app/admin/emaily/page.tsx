import type { Metadata } from 'next'
import { PageHeader, Section } from '@/components/admin/section'
import { requireStaff } from '@/lib/auth/session'
import { isEmailConfigured } from '@/lib/email/send'

export const metadata: Metadata = { title: 'E-maily' }

const PREVIEWS = [
  { title: '1 · Rezervácia prijatá – nový zákazník', query: 'sablona=zakaznik&jazyk=sk' },
  { title: '1 · Rezervácia prijatá – existujúci účet', query: 'sablona=zakaznik&jazyk=sk&varianta=existujuci' },
  { title: '1 · Dopyt s individuálnou cenou', query: 'sablona=zakaznik&jazyk=sk&varianta=dopyt' },
  { title: '1 · Booking received (EN)', query: 'sablona=zakaznik&jazyk=en' },
  { title: '2 · Nová rezervácia – notifikácia pre BTW', query: 'sablona=admin' },
  { title: '2 · Notifikácia s upozorneniami (kolízia, blacklist)', query: 'sablona=admin&varianta=kolizia' },
]

export default async function EmailsPage() {
  await requireStaff('operator', '/admin/emaily')
  return (
    <div>
      <PageHeader title="E-maily" />
      <p className="mb-6 text-sm text-muted2">
        Náhľady šablón s ukážkovými údajmi.{' '}
        {isEmailConfigured() ? 'Odosielanie je zapnuté.' : 'Odosielanie zatiaľ nie je nastavené (chýba kľúč Resend) – e-maily sa neodosielajú, pokusy sa zapisujú k rezervácii.'}
      </p>
      <div className="space-y-4">
        {PREVIEWS.map((preview) => (
          <Section key={preview.query} title={preview.title}>
            <iframe src={`/admin/emaily/nahlad?${preview.query}`} title={preview.title} loading="lazy" className="h-[640px] w-full rounded-lg border border-line bg-[#111111]" />
            <p className="mt-3 text-sm">
              <a href={`/admin/emaily/nahlad?${preview.query}`} target="_blank" rel="noopener" className="text-gold underline-offset-4 hover:underline">
                Otvoriť v novom okne
              </a>
              {' · '}
              <a href={`/admin/emaily/nahlad?${preview.query}&format=text`} target="_blank" rel="noopener" className="text-gold underline-offset-4 hover:underline">
                Textová verzia
              </a>
            </p>
          </Section>
        ))}
      </div>
    </div>
  )
}
