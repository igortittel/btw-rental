'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X, LogOut, User, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { User as SupabaseUser } from '@supabase/supabase-js'

const CUSTOMER_LINKS = [
  { href: '/fleet',          label: 'Our Fleet' },
  { href: '/#how-it-works',  label: 'How It Works' },
  { href: '/#contact',       label: 'Contact' },
]

const ADMIN_LINKS = [
  { href: '/admin/bookings',    label: 'Bookings' },
  { href: '/admin/vehicles',    label: 'Fleet' },
  { href: '/admin/maintenance', label: 'Maintenance' },
]

export default function Navbar() {
  const [user,       setUser]       = useState<SupabaseUser | null>(null)
  const [isAdmin,    setIsAdmin]    = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled,   setScrolled]   = useState(false)
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setIsAdmin((data.user?.user_metadata as Record<string,string>)?.role === 'admin')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
      setIsAdmin((session?.user?.user_metadata as Record<string,string>)?.role === 'admin')
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  const navLinks = isAdmin ? ADMIN_LINKS : CUSTOMER_LINKS

  return (
    <nav className={cn(
      'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
      scrolled || mobileOpen
        ? 'bg-rich-black/95 backdrop-blur-md border-b border-zinc-800/80 shadow-xl'
        : 'bg-transparent'
    )}>
      <div className="container mx-auto flex h-16 items-center justify-between px-4">

        {/* Logo */}
        <Link href={isAdmin && user ? '/admin' : '/'} className="flex items-center gap-2">
          <span className="text-2xl font-black font-montserrat tracking-wider text-gold">BTW</span>
          {isAdmin && (
            <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-zinc-500 border-l border-zinc-700 pl-2">
              <Shield className="h-3 w-3 text-gold/60" /> Admin
            </span>
          )}
          {!isAdmin && (
            <span className="hidden sm:block text-xs font-medium text-zinc-500 tracking-widest uppercase border-l border-zinc-700 pl-2">
              By The Wave
            </span>
          )}
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                pathname.startsWith(link.href) && link.href !== '/'
                  ? 'text-gold'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              )}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-1" /> Sign Out
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth/login">Sign In</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/fleet">Book Now</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 text-zinc-400 hover:text-white"
          onClick={() => setMobileOpen(o => !o)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-rich-black/98 px-4 pb-6 pt-2">
          <div className="flex flex-col gap-1">
            {navLinks.map(link => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="px-3 py-3 text-sm font-medium text-zinc-300 hover:text-white hover:bg-white/5 rounded-md"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-col gap-2">
              {user ? (
                <Button variant="ghost" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4 mr-2" /> Sign Out
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" onClick={() => setMobileOpen(false)}>
                    <Link href="/auth/login"><User className="h-4 w-4 mr-2" />Sign In</Link>
                  </Button>
                  <Button asChild onClick={() => setMobileOpen(false)}>
                    <Link href="/fleet">Book Now</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
