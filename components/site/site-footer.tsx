import Image from 'next/image'
import { getTranslations } from 'next-intl/server'

export async function SiteFooter() {
  const t = await getTranslations('site')
  const linkClass = 'block text-sm text-muted2 transition-colors hover:text-white'

  return (
    <footer className="border-t border-gold/30 bg-black px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 md:flex-row md:justify-between">
        <a href="https://www.btw.sk">
          <Image src="/images/logo.svg" alt={t('name')} width={44} height={40} className="h-10 w-auto" />
        </a>
        <div className="space-y-3 text-center md:text-left">
          <a className={linkClass} href="https://www.btw.sk/vseobecne-obchodne-podmienky">
            {t('terms')}
          </a>
          <a className={linkClass} href="https://www.btw.sk/ochrana-osobnych-udajov">
            {t('privacy')}
          </a>
        </div>
        <div className="space-y-3 text-center text-sm text-muted2 md:text-right">
          <p>BY THE WAVE, s.r.o.</p>
          <p>Trenčianska 56/A, Bratislava</p>
          <a className="block transition-colors hover:text-white" href="mailto:btw@btw.sk">
            btw@btw.sk
          </a>
        </div>
      </div>
    </footer>
  )
}
