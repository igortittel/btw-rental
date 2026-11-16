import { NextResponse, type NextRequest } from 'next/server'
import { createPublicClient, getCatalog } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

const MAX_RANGE_MS = 100 * 24 * 3600_000

/**
 * Occupied intervals of a vehicle for the public calendar:
 *   GET /api/availability?vin=…&from=ISO&to=ISO  ->  { ranges: [{ start, end, kind }] }
 * kind is "booked" (confirmed bookings incl. preparation time, manual blocks) or
 * "pending" (new bookings awaiting confirmation). No personal data, no reasons.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const vin = (searchParams.get('vin') ?? '').toUpperCase()
  const from = new Date(searchParams.get('from') ?? '')
  const to = new Date(searchParams.get('to') ?? '')
  if (!/^[A-Z0-9]{5,20}$/.test(vin) || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > MAX_RANGE_MS) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 })
  }

  const vehicle = (await getCatalog()).vehicles.find((v) => v.vin === vin)
  if (!vehicle) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const { data, error } = await createPublicClient().rpc('vehicle_availability', {
    p_vehicle_id: vehicle.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  if (error) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  return NextResponse.json(
    { ranges: (data ?? []).map((r) => ({ start: r.starts_at, end: r.ends_at, kind: r.kind })) },
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=30' } },
  )
}
