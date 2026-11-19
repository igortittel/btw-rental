'use client'

import { useEffect } from 'react'

// Unexpected error on an admin page: the navigation stays, the page offers a retry.
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <div role="alert" className="rounded-xl border border-red-400/60 bg-red-500/10 p-6 text-sm text-red-100">
      <h1 className="text-lg font-bold text-white">Stránku sa nepodarilo načítať</h1>
      <p className="mt-2">Skúste to znova. Ak chyba pretrváva, obnovte stránku alebo sa odhláste a prihláste znova.{error.digest ? ` Kód chyby: ${error.digest}.` : ''}</p>
      <button type="button" onClick={reset} className="mt-4 inline-flex h-11 items-center rounded-lg bg-gold px-5 font-semibold text-white hover:bg-gold-hover">
        Skúsiť znova
      </button>
    </div>
  )
}
