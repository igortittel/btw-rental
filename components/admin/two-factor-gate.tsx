'use client'

import { useEffect, useState } from 'react'
import { logoutAction } from '@/lib/auth/actions'
import { createClient } from '@/lib/supabase/client'

type Enrollment = { factorId: string; qr: string; secret: string }

const ERRORS: Record<string, string> = {
  invalid: 'Kód nesedí. Skontrolujte, či zadávate aktuálny 6-miestny kód z aplikácie (mení sa každých 30 sekúnd) a či má telefón správny čas.',
  generic: 'Overenie sa nepodarilo. Skúste to znova.',
  rate: 'Priveľa pokusov. Počkajte chvíľu a skúste to znova.',
}

function errorFor(message: string | undefined): string {
  if (!message) return ERRORS.generic
  if (/invalid|expired/i.test(message)) return ERRORS.invalid
  if (/rate|too many/i.test(message)) return ERRORS.rate
  return ERRORS.generic
}

/**
 * Second factor for staff (TOTP, Supabase MFA). Shown by the admin layout instead of the
 * page while the session is only aal1. First sign-in: scan the QR code in an
 * authenticator app and confirm a code. Later sign-ins: enter the current code.
 * After a successful verification the session is aal2 and the page reloads.
 */
export function TwoFactorGate({ userName }: { userName: string }) {
  const [mode, setMode] = useState<'loading' | 'enroll' | 'verify'>('loading')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false
    void (async () => {
      const { data, error: listError } = await supabase.auth.mfa.listFactors()
      if (cancelled) return
      if (listError) {
        setError(ERRORS.generic)
        return
      }
      const verified = data.totp.find((f) => f.status === 'verified')
      if (verified) {
        setFactorId(verified.id)
        setMode('verify')
        return
      }
      // Leftovers of an interrupted enrollment would block a new one.
      for (const factor of data.all.filter((f) => f.factor_type === 'totp' && f.status !== 'verified')) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id })
      }
      const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `BTW admin ${new Date().toISOString().slice(0, 16)}`, issuer: 'BTW Rental' })
      if (cancelled) return
      if (enrollError || !enrolled) {
        setError(ERRORS.generic)
        return
      }
      setEnrollment({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
      setFactorId(enrolled.id)
      setMode('enroll')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const verify = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!factorId || busy) return
    setBusy(true)
    setError(null)
    const { error: verifyError } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
    if (verifyError) {
      setBusy(false)
      setError(errorFor(verifyError.message))
      return
    }
    // The session cookie now carries aal2; reload so the server renders the admin.
    window.location.reload()
  }

  return (
    <div className="mx-auto max-w-md space-y-5 rounded-xl border border-gold/50 bg-surface p-5 sm:p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-gold">Dvojstupňové overenie</p>
        <h1 className="mt-2 text-xl font-bold text-white">{mode === 'enroll' ? 'Zapnite si overenie v aplikácii' : 'Zadajte kód z aplikácie'}</h1>
        <p className="mt-2 text-sm text-muted2">
          {mode === 'enroll'
            ? `${userName ? `${userName}, p` : 'P'}rístup do administrácie chráni okrem hesla aj kód z overovacej aplikácie v telefóne (Google Authenticator, Microsoft Authenticator, 1Password…).`
            : 'Otvorte overovaciu aplikáciu v telefóne a zadajte aktuálny 6-miestny kód pre BTW Rental.'}
        </p>
      </div>

      {mode === 'loading' && !error ? <p className="text-sm text-muted2">Načítavam…</p> : null}

      {mode === 'enroll' && enrollment ? (
        <ol className="list-decimal space-y-3 pl-5 text-sm text-white">
          <li>
            V aplikácii zvoľte „Pridať účet“ a naskenujte kód:
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG data URL from Supabase */}
            <img src={enrollment.qr} alt="QR kód pre overovaciu aplikáciu" width={184} height={184} className="mt-3 rounded-lg bg-white p-2" />
            <span className="mt-2 block text-xs text-muted2">
              Nejde skenovať? Zadajte kľúč ručne: <code className="break-all text-white">{enrollment.secret}</code>
            </span>
          </li>
          <li>Zadajte 6-miestny kód, ktorý aplikácia ukáže.</li>
        </ol>
      ) : null}

      {mode !== 'loading' ? (
        <form onSubmit={verify} className="space-y-3">
          <label htmlFor="totp-code" className="block text-sm font-medium text-white">
            Kód z aplikácie
          </label>
          <input
            id="totp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="123456"
            className="h-12 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-center text-xl tracking-[0.4em] text-white focus:border-gold/50 focus:outline-none"
          />
          <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className="h-12 w-full rounded-lg bg-gold text-base font-semibold text-white hover:bg-gold-hover disabled:opacity-50">
            {busy ? 'Overujem…' : mode === 'enroll' ? 'Zapnúť a pokračovať' : 'Overiť'}
          </button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span className="text-muted2">Stratili ste telefón? Majiteľ vám 2FA zresetuje v časti Zamestnanci.</span>
        <form action={logoutAction}>
          <button type="submit" className="min-h-11 text-gold underline underline-offset-4">
            Odhlásiť sa
          </button>
        </form>
      </div>
    </div>
  )
}
