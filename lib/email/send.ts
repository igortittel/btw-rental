import 'server-only'
import { env } from '@/lib/env'
import { createAdminClient } from '@/lib/supabase/admin'

export type EmailMessage = {
  type: string
  to: string
  subject: string
  html: string
  text: string
  locale?: string
  profileId?: string | null
  bookingId?: string | null
  /** Defaults to the company address. */
  replyTo?: string
}

export type EmailResult = { sent: boolean; reason?: 'not_configured' | 'provider_error' }

const FROM = 'BY THE WAVE <info@rental.btw.sk>'
const REPLY_TO = 'btw@btw.sk'

export function isEmailConfigured(): boolean {
  return !!env.resendApiKey
}

/**
 * Sends a transactional email through Resend and records it in `email_log`.
 * Never throws: callers decide what a failed email means for their flow.
 */
export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const admin = createAdminClient()
  const log = async (status: 'sent' | 'failed', resendId: string | null, error: string | null) => {
    await admin.from('email_log').insert({
      type: message.type,
      recipient: message.to,
      locale: message.locale ?? null,
      profile_id: message.profileId ?? null,
      booking_id: message.bookingId ?? null,
      resend_id: resendId,
      status,
      error,
    })
  }

  const apiKey = env.resendApiKey
  if (!apiKey) {
    await log('failed', null, 'email_not_configured')
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        reply_to: message.replyTo ?? REPLY_TO,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    })
    const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
    if (!response.ok) {
      await log('failed', null, `resend_${response.status}: ${body.message ?? 'unknown error'}`.slice(0, 500))
      return { sent: false, reason: 'provider_error' }
    }
    await log('sent', body.id ?? null, null)
    return { sent: true }
  } catch (e) {
    await log('failed', null, `resend_exception: ${e instanceof Error ? e.message : 'unknown'}`.slice(0, 500))
    return { sent: false, reason: 'provider_error' }
  }
}
