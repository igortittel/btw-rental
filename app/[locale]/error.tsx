'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'

// Unexpected error while rendering a public page: keep header and footer, offer a retry.
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('site')
  useEffect(() => {
    console.error(error)
  }, [error])
  return (
    <section className="mx-auto max-w-xl px-6 pb-24 pt-36 text-center">
      <h1 className="text-3xl font-bold tracking-wide text-white md:text-4xl">{t('errorTitle')}</h1>
      <p className="mt-4 leading-7 text-muted2">{t('errorText')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-8 inline-flex h-12 items-center justify-center rounded-lg bg-gold px-8 text-base font-semibold text-white transition-colors hover:bg-gold-hover"
      >
        {t('errorRetry')}
      </button>
    </section>
  )
}
