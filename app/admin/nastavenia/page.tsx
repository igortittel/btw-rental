import type { Metadata } from 'next'
import {
  saveAssistanceAction,
  saveBankAction,
  saveBookingRulesAction,
  saveCancellationAction,
  saveCompanyAction,
  saveConditionsAction,
  saveLegalAction,
  saveNotificationsAction,
  savePriceTiersAction,
} from './actions'
import { PageHeader, Section } from '@/components/admin/section'
import { ActionForm, Check, Field, SubmitButton } from '@/components/admin/ui'
import { requireStaff } from '@/lib/auth/session'
import { centsToInput } from '@/lib/format'
import { isValidIban } from '@/lib/iban'
import { getSettings } from '@/lib/settings'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Nastavenia' }

const PAYMENT_METHODS = [
  ['transfer', 'Bankový prevod'],
  ['terminal', 'Platobný terminál'],
  ['cash', 'Hotovosť'],
] as const

export default async function SettingsPage() {
  await requireStaff('owner', '/admin/nastavenia')
  const supabase = await createClient()
  const [settings, { data: tiers }] = await Promise.all([getSettings(supabase), supabase.from('price_tiers').select('*').order('min_days')])
  const [above, between, below] = settings.cancellation_tiers
  const pricedTiers = (tiers ?? []).filter((t) => t.max_days !== null)
  const ibanMissing = !isValidIban(settings.bank.iban)

  return (
    <div className="space-y-6">
      <PageHeader title="Nastavenia" />

      <Section title="Firemné údaje a DPH" description="Používajú sa v PDF dokumentoch a e-mailoch.">
        <ActionForm action={saveCompanyAction}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Názov firmy" name="name" defaultValue={settings.company.name} required />
            <Field label="Adresa" name="address" defaultValue={settings.company.address} className="lg:col-span-2" required />
            <Field label="IČO" name="ico" defaultValue={settings.company.ico ?? ''} />
            <Field label="DIČ" name="dic" defaultValue={settings.company.dic ?? ''} />
            <Field label="IČ DPH" name="ic_dph" defaultValue={settings.company.ic_dph ?? ''} />
            <Field label="Telefón" name="phone" type="tel" defaultValue={settings.company.phone ?? ''} />
            <Field label="E-mail" name="email" type="email" defaultValue={settings.company.email ?? ''} />
            <Field label="Web" name="web" type="url" defaultValue={settings.company.web ?? ''} />
            <Field label="Sadzba DPH (%)" name="vat_rate" inputMode="decimal" defaultValue={settings.vat_rate} hint="Ceny v systéme sú uvedené s DPH." required />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Bankové údaje a platby" description="IBAN a variabilný symbol dostane zákazník v potvrdzujúcom e-maile pri platbe prevodom.">
        {ibanMissing ? (
          <p role="alert" className="mb-5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            IBAN zatiaľ nie je vyplnený. Bez neho nemožno zákazníkom posielať platobné pokyny.
          </p>
        ) : null}
        <ActionForm action={saveBankAction}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="IBAN" name="iban" defaultValue={ibanMissing ? '' : settings.bank.iban} placeholder="SK00 0000 0000 0000 0000 0000" spellCheck={false} required />
            <Field label="SWIFT / BIC" name="swift" defaultValue={ibanMissing ? '' : settings.bank.swift} spellCheck={false} required />
            <Field label="Názov účtu" name="account_name" defaultValue={settings.bank.account_name} required />
            <Field label="Splatnosť prevodu (dni)" name="payment_due_days" type="number" min={0} defaultValue={settings.payment_due_days} />
            <fieldset className="space-y-1 sm:col-span-2">
              <legend className="mb-2 text-sm font-medium text-zinc-300">Povolené platobné metódy</legend>
              {PAYMENT_METHODS.map(([value, label]) => (
                <Check key={value} label={label} name={`method_${value}`} defaultChecked={settings.payment_methods.includes(value)} />
              ))}
            </fieldset>
            <div className="sm:col-span-2 lg:col-span-3">
              <Check
                label="Pred odovzdaním vozidla vyžadovať úhradu prenájmu a prijatie depozitu"
                name="require_payment_before_pickup"
                defaultChecked={settings.require_payment_before_pickup}
                hint="Odovzdávací protokol sa dá podpísať, až keď sú obe platby zaznamenané. Zaznamenať ich možno aj priamo v protokole."
              />
            </div>
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Pravidlá rezervácie" description="Prevádzka je non-stop (24/7): vyzdvihnutie aj odovzdanie je možné kedykoľvek, bez príplatku.">
        <ActionForm action={saveBookingRulesAction}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Min. predstih rezervácie (hodiny)" name="min_lead_hours" type="number" min={0} defaultValue={settings.min_lead_hours} required />
            <Field label="Min. dĺžka prenájmu (dni)" name="min_rental_days" type="number" min={1} defaultValue={settings.min_rental_days} required />
            <Field
              label="Tolerancia vrátenia (minúty)"
              name="return_tolerance_minutes"
              type="number"
              min={0}
              defaultValue={settings.return_tolerance_minutes}
              hint="Meškanie do tejto hranice sa nepočíta ako ďalší deň."
              required
            />
            <Field
              label="Príprava medzi prenájmami (hodiny)"
              name="default_buffer_hours"
              type="number"
              min={0}
              defaultValue={Math.round(settings.default_buffer_minutes / 60)}
              hint="Dá sa zmeniť pri jednotlivých vozidlách."
              required
            />
            <Field
              label="Lehota na úpravu zákazníkom (hodiny)"
              name="modification_deadline_hours"
              type="number"
              min={0}
              defaultValue={settings.modification_deadline_hours}
              hint="Koľko hodín pred vyzdvihnutím si zákazník ešte môže rezerváciu upraviť sám."
              required
            />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Podmienky prenájmu" description="Globálne hodnoty. Pri jednotlivých vozidlách ich možno prepísať.">
        <ActionForm action={saveConditionsAction}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Vratný depozit (€)" name="deposit" inputMode="decimal" defaultValue={centsToInput(settings.deposit_cents)} required />
            <Field label="Limit km / deň" name="km_limit_per_day" type="number" min={1} defaultValue={settings.km_limit_per_day} required />
            <Field label="Cena za km navyše (€)" name="extra_km" inputMode="decimal" defaultValue={centsToInput(settings.extra_km_cents)} required />
            <Field label="Min. vek vodiča" name="min_driver_age" type="number" min={18} max={99} defaultValue={settings.min_driver_age} required />
            <Field label="Min. vlastníctvo VP (mesiace)" name="min_license_months" type="number" min={0} defaultValue={settings.min_license_months} required />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Storno podmienky" description="Počíta sa od času vyzdvihnutia. Poplatok je percento z ceny rezervácie.">
        <ActionForm action={saveCancellationAction}>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="1. hranica (hodín pred vyzdvihnutím)" name="upper_hours" type="number" min={1} defaultValue={above?.min_hours ?? 72} required />
            <Field label="Poplatok pri storne skôr (%)" name="percent_above" type="number" min={0} max={100} defaultValue={above?.fee_percent ?? 0} required />
            <div className="hidden lg:block" />
            <Field label="2. hranica (hodín pred vyzdvihnutím)" name="lower_hours" type="number" min={0} defaultValue={between?.min_hours ?? 24} required />
            <Field label="Poplatok medzi hranicami (%)" name="percent_between" type="number" min={0} max={100} defaultValue={between?.fee_percent ?? 20} required />
            <Field label="Poplatok po 2. hranici (%)" name="percent_below" type="number" min={0} max={100} defaultValue={below?.fee_percent ?? 100} required />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section
        title="Cenové hladiny"
        description="Horná hranica každej hladiny v dňoch. Dlhší prenájom ako posledná hranica je dopyt s individuálnou cenou. Ceny vozidiel zostávajú priradené k hladinám."
      >
        <ActionForm action={savePriceTiersAction} confirm="Zmena hraníc sa prejaví v cenníku všetkých vozidiel. Pokračovať?">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {pricedTiers.map((tier, index) => (
              <Field
                key={tier.id}
                label={`${index + 1}. hladina – do (dní)`}
                name={`max_${tier.id}`}
                type="number"
                min={1}
                max={365}
                defaultValue={tier.max_days ?? ''}
                hint={`teraz ${tier.min_days}–${tier.max_days} dní`}
                required
              />
            ))}
          </div>
          <p className="mt-4 text-sm text-muted2">Individuálna cena od {settings.individual_price_from_days}. dňa.</p>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Asistenčná služba" description="Zobrazuje sa zákazníkovi v zóne. Pri jednotlivých vozidlách ju možno prepísať.">
        <ActionForm action={saveAssistanceAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Telefón (nonstop)" name="phone" type="tel" defaultValue={settings.assistance.phone} required />
            <Field label="Poisťovňa" name="insurer" defaultValue={settings.assistance.insurer ?? ''} />
            <Field label="Číslo poistnej zmluvy" name="policy_number" defaultValue={settings.assistance.policy_number ?? ''} hint="Interný údaj." />
            <Field label="Poznámka" name="note" defaultValue={settings.assistance.note ?? ''} />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="Notifikácie a recenzie">
        <ActionForm action={saveNotificationsAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Notifikačné e-maily pre admina"
              name="emails"
              defaultValue={settings.admin_notification_emails.join(', ')}
              hint="Viac adries oddeľte čiarkou."
              className="sm:col-span-2"
              required
            />
            <Field label="Žiadosť o recenziu (dní po ukončení)" name="review_request_days" type="number" min={0} defaultValue={settings.review_request_days} />
            <Field label="Odkaz na Google recenziu" name="google_review_url" type="url" defaultValue={settings.google_review_url ?? ''} placeholder="https://g.page/r/…" />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>

      <Section title="VOP a ochrana osobných údajov" description="Verzia sa ukladá ku každému súhlasu zákazníka. Zvýšte ju vždy, keď sa zmení znenie dokumentu.">
        <ActionForm action={saveLegalAction}>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Odkaz na VOP" name="terms_url" type="url" defaultValue={settings.terms_url} required />
            <Field label="Odkaz na ochranu osobných údajov" name="gdpr_url" type="url" defaultValue={settings.gdpr_url} required />
            <Check label={`Zvýšiť verziu VOP (aktuálna: ${settings.terms_version})`} name="bump_terms" />
            <Check label={`Zvýšiť verziu GDPR (aktuálna: ${settings.gdpr_version})`} name="bump_gdpr" />
          </div>
          <div className="mt-5">
            <SubmitButton />
          </div>
        </ActionForm>
      </Section>
    </div>
  )
}
