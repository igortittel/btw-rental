import 'server-only'
import { localizedPath } from '@/i18n/routing'
import { bookingEmailDataFromRow } from '@/lib/booking/email-data'
import { dailyWindows } from '@/lib/cron/windows'
import { sendBookingReminder, sendReviewRequest } from '@/lib/email/booking-emails'
import { formatEuro } from '@/lib/format'
import { depositOutstandingCents, missingPayments, rentalOutstandingCents } from '@/lib/payment'
import { getSettings } from '@/lib/settings'
import { getConfiguredOrigin } from '@/lib/site-url'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/types/database'

type Booking = Database['public']['Tables']['bookings']['Row']
type BookingUpdate = Database['public']['Tables']['bookings']['Update']
type Admin = ReturnType<typeof createAdminClient>
type Counter = { sent: number; failed: number; skipped: number }
export type DailyResult = { pickup: Counter; return: Counter; review: Counter; cleanup: { tokens: number; rateLimits: number } }

const counter = (): Counter => ({ sent: 0, failed: 0, skipped: 0 })
const SELECT = '*, vehicles(name, assistance)'
type Row = Booking & { vehicles: { name: string; assistance: unknown } | null }

/**
 * Claims one reminder column atomically (only if still empty), so two runs can never send
 * the same email. Returns false when another run was faster.
 */
async function claim(admin: Admin, id: string, column: 'pickup_reminder_sent_at' | 'return_reminder_sent_at' | 'review_requested_at', at: string): Promise<boolean> {
  const { data } = await admin
    .from('bookings')
    .update({ [column]: at } as BookingUpdate)
    .eq('id', id)
    .is(column, null)
    .select('id')
  return (data ?? []).length === 1
}
async function release(admin: Admin, id: string, column: 'pickup_reminder_sent_at' | 'return_reminder_sent_at' | 'review_requested_at') {
  await admin
    .from('bookings')
    .update({ [column]: null } as BookingUpdate)
    .eq('id', id)
}

/**
 * The morning run: reminders the day before the pick-up (email 7) and the return
 * (email 9), the thank-you with a Google review link (email 12), and housekeeping.
 * Uses the service role; every email is claimed in the database first, so a repeated or
 * overlapping run sends nothing twice. A failed email releases the claim for the next run.
 */
export async function runDaily(now = new Date()): Promise<DailyResult> {
  const admin = createAdminClient()
  const settings = await getSettings(admin)
  const origin = getConfiguredOrigin()
  const w = dailyWindows(now, settings.review_request_days)
  const at = now.toISOString()
  const result: DailyResult = { pickup: counter(), return: counter(), review: counter(), cleanup: { tokens: 0, rateLimits: 0 } }
  const accountUrl = (b: Booking, locale: 'sk' | 'en') => `${origin}${localizedPath(locale, `/moj-ucet/rezervacie/${b.id}`)}`
  const assistanceOf = (row: Row) => ((row.vehicles?.assistance ?? null) as { phone?: string } | null)?.phone || settings.assistance.phone || null

  // ── email 7: pick-up tomorrow ──
  const { data: pickups } = await admin
    .from('bookings')
    .select(SELECT)
    .in('status', ['confirmed', 'modified'])
    .is('pickup_reminder_sent_at', null)
    .gte('pickup_at', w.remindFrom.toISOString())
    .lt('pickup_at', w.remindUntil.toISOString())
  for (const row of (pickups ?? []) as Row[]) {
    const data = bookingEmailDataFromRow(row, row.vehicles?.name ?? '', settings.company)
    if (!(await claim(admin, row.id, 'pickup_reminder_sent_at', at))) continue
    if (!data.customer.email) {
      result.pickup.skipped++
      continue
    }
    const missing = missingPayments(row)
    const euro = (cents: number | null) => formatEuro(cents, data.locale)
    const sent = await sendBookingReminder(
      {
        booking: data,
        kind: 'pickup',
        unpaid: {
          rental: missing.includes('rental') ? `${euro(rentalOutstandingCents(row))} · ${data.rentalPayment}` : null,
          deposit: missing.includes('deposit') ? `${euro(depositOutstandingCents(row))} · ${data.depositPayment}` : null,
        },
        toleranceMinutes: settings.return_tolerance_minutes,
        assistancePhone: assistanceOf(row),
        accountUrl: accountUrl(row, data.locale),
      },
      { bookingId: row.id, profileId: row.customer_id },
    )
    if (sent.sent) result.pickup.sent++
    else {
      result.pickup.failed++
      await release(admin, row.id, 'pickup_reminder_sent_at')
    }
  }

  // ── email 9: return tomorrow ──
  const { data: returns } = await admin
    .from('bookings')
    .select(SELECT)
    .in('status', ['confirmed', 'modified', 'active'])
    .is('return_reminder_sent_at', null)
    .gte('return_at', w.remindFrom.toISOString())
    .lt('return_at', w.remindUntil.toISOString())
    .lt('pickup_at', w.pickedUpBefore.toISOString())
  for (const row of (returns ?? []) as Row[]) {
    const data = bookingEmailDataFromRow(row, row.vehicles?.name ?? '', settings.company)
    if (!(await claim(admin, row.id, 'return_reminder_sent_at', at))) continue
    if (!data.customer.email) {
      result.return.skipped++
      continue
    }
    const sent = await sendBookingReminder(
      {
        booking: data,
        kind: 'return',
        unpaid: { rental: null, deposit: null },
        toleranceMinutes: settings.return_tolerance_minutes,
        assistancePhone: assistanceOf(row),
        accountUrl: accountUrl(row, data.locale),
      },
      { bookingId: row.id, profileId: row.customer_id },
    )
    if (sent.sent) result.return.sent++
    else {
      result.return.failed++
      await release(admin, row.id, 'return_reminder_sent_at')
    }
  }

  // ── email 12: thank you + Google review ──
  if (settings.google_review_url) {
    const { data: done } = await admin
      .from('bookings')
      .select(SELECT)
      .eq('status', 'completed')
      .is('review_requested_at', null)
      .gte('return_at', w.reviewReturnedAfter.toISOString())
      .lt('return_at', w.reviewReturnedBefore.toISOString())
    const rows = (done ?? []) as Row[]
    // Blacklisted customers get no review request (client decision, Phase 9).
    const customerIds = [...new Set(rows.map((r) => r.customer_id))]
    const { data: blacklisted } = customerIds.length > 0 ? await admin.from('customer_internal').select('profile_id').eq('is_blacklisted', true).in('profile_id', customerIds) : { data: [] }
    const skip = new Set((blacklisted ?? []).map((b) => b.profile_id))
    // One request per customer per run, even with several finished rentals.
    const asked = new Set<string>()
    for (const row of rows) {
      const data = bookingEmailDataFromRow(row, row.vehicles?.name ?? '', settings.company)
      if (!(await claim(admin, row.id, 'review_requested_at', at))) continue
      if (!data.customer.email || skip.has(row.customer_id) || asked.has(row.customer_id)) {
        result.review.skipped++
        continue
      }
      asked.add(row.customer_id)
      const sent = await sendReviewRequest(
        { booking: data, reviewUrl: settings.google_review_url, siteUrl: `${origin}${localizedPath(data.locale, '/')}` },
        { bookingId: row.id, profileId: row.customer_id },
      )
      if (sent.sent) result.review.sent++
      else {
        result.review.failed++
        await release(admin, row.id, 'review_requested_at')
      }
    }
  }

  // ── housekeeping: expired one-time links and old rate-limit counters ──
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString()
  const { count: tokens } = await admin.from('auth_tokens').delete({ count: 'exact' }).lt('expires_at', weekAgo)
  const { count: limits } = await admin
    .from('rate_limits')
    .delete({ count: 'exact' })
    .lt('window_start', new Date(now.getTime() - 86_400_000).toISOString())
  result.cleanup = { tokens: tokens ?? 0, rateLimits: limits ?? 0 }
  return result
}
