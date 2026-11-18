import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { runDaily } from '@/lib/cron/daily'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') ?? ''
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const given = Buffer.from(header)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Daily run, called by Vercel Cron (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Everything else gets a 401. The outcome is stored in `cron_runs` for the dashboard.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return new NextResponse('Unauthorized', { status: 401 })
  const admin = createAdminClient()
  const { data: run } = await admin.from('cron_runs').insert({ job: 'daily' }).select('id').single()
  try {
    const result = await runDaily()
    const failed = result.pickup.failed + result.return.failed + result.review.failed
    if (run) await admin.from('cron_runs').update({ finished_at: new Date().toISOString(), ok: failed === 0, result }).eq('id', run.id)
    return NextResponse.json({ ok: true, result })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'unknown error'
    console.error('daily cron failed', e)
    if (run) await admin.from('cron_runs').update({ finished_at: new Date().toISOString(), ok: false, error: message.slice(0, 500) }).eq('id', run.id)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
