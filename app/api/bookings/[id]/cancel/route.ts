import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getCancellationFee, getCancellationFeePct } from '@/lib/utils'

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, status, total_price, pickup_datetime, user_id')
    .eq('id', id)
    .single()

  if (error || !booking)
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  if (booking.user_id !== user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (booking.status === 'cancelled')
    return NextResponse.json({ error: 'Already cancelled' }, { status: 400 })

  if (booking.status === 'completed')
    return NextResponse.json({ error: 'Cannot cancel a completed booking' }, { status: 400 })

  const cancellationFee = getCancellationFee(booking.total_price, booking.pickup_datetime)
  const feePct          = getCancellationFeePct(booking.pickup_datetime)

  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancellation_fee: cancellationFee, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, cancellation_fee: cancellationFee, fee_pct: feePct })
}
