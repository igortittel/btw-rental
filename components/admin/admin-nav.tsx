'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import { CalendarCheck, Car, ChevronDown, LayoutDashboard, Menu, Users, X } from 'lucide-react'
import { logoutAction } from '@/lib/auth/actions'

export type AdminLink = { href: string; label: string }
type Props = { primary: AdminLink[]; secondary: AdminLink[]; userName: string; roleLabel: string }

const ICONS: Record<string, typeof Car> = { '/admin': LayoutDashboard, '/admin/rezervacie': CalendarCheck, '/admin/zakaznici': Users, '/admin/vozidla': Car }

/**
 * Admin navigation. Desktop: a slim top bar with the three main sections, the rest
 * under "Viac" and the account in a menu. Phones: a bottom tab bar within thumb reach.
 */
export function AdminNav({ primary, secondary, userName, roleLabel }: Props) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`))
  const secondaryActive = secondary.some((link) => isActive(link.href)) || isActive('/admin/profil')

  // Menus close when the page changes (state adjusted during render, not in an effect).
  const [menuPath, setMenuPath] = useState(pathname)
  if (menuPath !== pathname) {
    setMenuPath(pathname)
    setMoreOpen(false)
    setUserOpen(false)
    setSheetOpen(false)
  }

  const topLink = (active: boolean) => `inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium transition-colors ${active ? 'bg-gold/15 text-white' : 'text-muted2 hover:text-white'}`
  const menuItem = (active: boolean) => `flex min-h-11 items-center rounded-lg px-3 text-sm ${active ? 'bg-gold/15 font-semibold text-white' : 'text-white hover:bg-white/5'}`
  const panel = 'z-50 w-56 rounded-xl border border-gold/50 bg-[#161616] p-2 shadow-xl shadow-black/60'
  const logout = (
    <form action={logoutAction}>
      <button type="submit" className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-white hover:bg-white/5">
        Odhlásiť sa
      </button>
    </form>
  )

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gold/40 bg-black">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-3">
            <Image src="/images/logo.svg" alt="BY THE WAVE" width={84} height={28} className="h-7 w-auto" />
            <span className="text-xs font-semibold uppercase tracking-widest text-gold">Admin</span>
          </Link>

          <nav aria-label="Administrácia" className="hidden items-center gap-1 md:flex">
            {primary.map((link) => (
              <Link key={link.href} href={link.href} className={topLink(isActive(link.href))} aria-current={isActive(link.href) ? 'page' : undefined}>
                {link.label}
              </Link>
            ))}
            <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
              <Popover.Trigger className={`${topLink(secondary.some((link) => isActive(link.href)))} gap-1.5`}>
                Viac <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content align="start" sideOffset={8} className={panel}>
                  {secondary.map((link) => (
                    <Link key={link.href} href={link.href} className={menuItem(isActive(link.href))}>
                      {link.label}
                    </Link>
                  ))}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </nav>

          <Popover.Root open={userOpen} onOpenChange={setUserOpen}>
            <Popover.Trigger className="hidden h-9 max-w-[14rem] items-center gap-1.5 rounded-lg border border-line px-3 text-sm text-white hover:border-gold md:inline-flex">
              <span className="truncate">{userName}</span> <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content align="end" sideOffset={8} className={panel}>
                <p className="px-3 pb-2 pt-1 text-xs text-muted2">{roleLabel}</p>
                <Link href="/admin/profil" className={menuItem(isActive('/admin/profil'))}>
                  Môj profil
                </Link>
                {logout}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <span className="truncate text-xs text-muted2 md:hidden">{userName}</span>
        </div>
      </header>

      {/* Phones: bottom tab bar */}
      <nav aria-label="Administrácia" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-gold/40 bg-black pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((link) => {
          const Icon = ICONS[link.href] ?? LayoutDashboard
          const active = isActive(link.href)
          return (
            <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-gold' : 'text-muted2'}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
              {link.label}
            </Link>
          )
        })}
        <Dialog.Root open={sheetOpen} onOpenChange={setSheetOpen}>
          <Dialog.Trigger className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${secondaryActive ? 'text-gold' : 'text-muted2'}`}>
            <Menu className="h-5 w-5" aria-hidden="true" />
            Viac
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
            <Dialog.Content aria-describedby={undefined} className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-gold/50 bg-[#161616] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] focus:outline-none">
              <div className="mb-2 flex items-center justify-between">
                <Dialog.Title className="text-sm font-semibold text-white">
                  {userName} <span className="font-normal text-muted2">· {roleLabel}</span>
                </Dialog.Title>
                <Dialog.Close className="flex h-11 w-11 items-center justify-center rounded-lg text-white" aria-label="Zavrieť">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Dialog.Close>
              </div>
              {secondary.map((link) => (
                <Link key={link.href} href={link.href} className={menuItem(isActive(link.href))}>
                  {link.label}
                </Link>
              ))}
              <div className="mt-2 border-t border-line pt-2">
                <Link href="/admin/profil" className={menuItem(isActive('/admin/profil'))}>
                  Môj profil
                </Link>
                {logout}
              </div>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </nav>
    </>
  )
}
