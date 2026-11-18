import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/auth/session'
import { bookingListQuery, parseBookingFilters } from '@/lib/booking/list-query'
import { BOOKING_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/lib/booking/status'
import { createClient } from '@/lib/supabase/server'
import { csvCell as cell } from '@/lib/csv'
import { formatDateTime } from '@/lib/time'

export const dynamic = 'force-dynamic'

type Snapshot = { first_name?: string; last_name?: string; email?: string; phone?: string; company_name?: string | null }


/** CSV export of the bookings matching the same filters as the list (semicolon-separated, UTF-8 with BOM for Excel). */
export async function GET(request: NextRequest) {
  if (!(await getStaff('operator'))) return new NextResponse('Forbidden', { status: 403 })
  const filters = parseBookingFilters(Object.fromEntries(request.nextUrl.searchParams))
  const { data, error } = await bookingListQuery(await createClient(), filters, 5000)
  if (error) return new NextResponse('Export sa nepodaril.', { status: 500 })

  const header = ['Číslo', 'Stav', 'Zákazník', 'Firma', 'E-mail', 'Telefón', 'Vozidlo', 'ŠPZ', 'Vyzdvihnutie', 'Odovzdanie', 'Dni', 'Cena s DPH (€)', 'Platba prenájmu', 'Platba depozitu', 'Vytvorené']
  const rows = (data ?? []).map((booking) => {
    const customer = (booking.customer_snapshot ?? {}) as Snapshot
    return [
      booking.number,
      BOOKING_STATUS_LABELS[booking.status],
      `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim(),
      customer.company_name,
      customer.email,
      customer.phone,
      booking.vehicles?.name,
      booking.vehicles?.license_plate,
      formatDateTime(booking.pickup_at),
      formatDateTime(booking.return_at),
      booking.days,
      booking.total_cents === null ? '' : (booking.total_cents / 100).toFixed(2).replace('.', ','),
      PAYMENT_METHOD_LABELS[booking.rental_payment_method],
      PAYMENT_METHOD_LABELS[booking.deposit_payment_method],
      formatDateTime(booking.created_at),
    ]
  })
  const csv = '﻿' + [header, ...rows].map((row) => row.map(cell).join(';')).join('\r\n') + '\r\n'
  const today = new Date().toISOString().slice(0, 10)
  return new NextResponse(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="rezervacie-${today}.csv"`, 'Cache-Control': 'no-store' },
  })
}
