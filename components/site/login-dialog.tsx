'use client'

import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslations } from 'next-intl'
import { LoginForm } from '@/components/auth/auth-forms'
import { Link, usePathname } from '@/i18n/navigation'

/**
 * "Sign in" in the header: opens the login form in a modal. It is a real link to
 * /prihlasenie, so it still works without JavaScript or when opened in a new tab.
 */
export function LoginDialog({ className }: { className?: string }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const onAuthPage = /^\/(prihlasenie|zabudnute-heslo|nastavit-heslo)/.test(pathname)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Link
        href="/prihlasenie"
        className={className}
        onClick={(e) => {
          if (onAuthPage || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
          e.preventDefault()
          setOpen(true)
        }}
      >
        {t('site.login')}
      </Link>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/80" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-gold bg-surface p-8 focus:outline-none">
          <Dialog.Title className="text-2xl font-bold tracking-wide text-white">{t('auth.loginTitle')}</Dialog.Title>
          <Dialog.Description className="mb-8 mt-3 text-sm leading-6 text-muted2">{t('auth.loginLead')}</Dialog.Description>
          <LoginForm />
          <Dialog.Close className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full text-2xl text-muted2 hover:text-white" aria-label={t('vehicle.close')}>
            ×
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
