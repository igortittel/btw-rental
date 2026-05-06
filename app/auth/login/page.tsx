'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') ?? '/dashboard'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
        shouldCreateUser: true,
      },
    })

    setLoading(false)
    if (authError) {
      setError(authError.message)
    } else {
      setSent(true)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(184,135,70,0.06)_0%,transparent_60%)]" />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="text-3xl font-black font-montserrat text-gold tracking-wider">BTW</span>
          </Link>
          {!sent ? (
            <>
              <h1 className="text-2xl font-bold font-montserrat text-white mb-2">
                Welcome Back
              </h1>
              <p className="text-zinc-400 text-sm">
                Enter your email and we'll send you a magic link.
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-bold font-montserrat text-white mb-2">
                Check Your Inbox
              </h1>
              <p className="text-zinc-400 text-sm">
                A sign-in link was sent to <strong className="text-gold">{email}</strong>
              </p>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-sm p-8">
          {!sent ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="pl-10"
                    required
                    autoFocus
                    autoComplete="email"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" size="lg" disabled={loading || !email}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending Link…</>
                ) : (
                  <><Mail className="h-4 w-4" /> Send Magic Link</>
                )}
              </Button>

              <p className="text-xs text-zinc-500 text-center leading-relaxed">
                No password needed. We'll email you a secure, one-time sign-in link.
              </p>
            </form>
          ) : (
            <div className="text-center space-y-5">
              <div className="h-16 w-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-gold" />
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Click the link in your email to sign in. The link expires in 10 minutes.
                If you don't see it, check your spam folder.
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => { setSent(false); setEmail('') }}
              >
                Try a Different Email
              </Button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-gold transition-colors"
          >
            <ArrowLeft className="h-3 w-3" /> Back to Homepage
          </Link>
        </div>
      </div>
    </div>
  )
}
