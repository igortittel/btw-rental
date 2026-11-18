import { NextResponse, type NextRequest } from 'next/server'
import { getStaff } from '@/lib/auth/session'
import { toCsv } from '@/lib/csv'
import { customerListQuery, parseCustomerQuery } from '@/lib/customers/list'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/time'

export const dynamic = 'force-dynamic'

/** CSV export of the customers matching the same search and filter as the list. */
export async function GET(request: NextRequest) {
  if (!(await getStaff('operator'))) return new NextResponse('Forbidden', { status: 403 })
  const query = parseCustomerQuery(Object.fromEntries(request.nextUrl.searchParams))
  const { data, error } = await customerListQuery(await createClient(), query, 10000)
  if (error) return new NextResponse('Export sa nepodaril.', { status: 500 })
  const header = ['Meno', 'Priezvisko', 'E-mail', 'Telefón', 'Firma', 'IČO', 'Počet rezervácií', 'Obrat s DPH (€)', 'Posledná rezervácia', 'Blacklist', 'Žiadosť o vymazanie', 'Zákazníkom od']
  const rows = (data ?? []).map((c) => [
    c.first_name, c.last_name, c.email, c.phone, c.company_name, c.ico, c.bookings_count,
    ((c.revenue_cents ?? 0) / 100).toFixed(2).replace('.', ','),
    c.last_pickup_at ? formatDate(c.last_pickup_at) : '',
    c.is_blacklisted ? 'áno' : '',
    c.deletion_requested_at ? formatDate(c.deletion_requested_at) : '',
    c.created_at ? formatDate(c.created_at) : '',
  ])
  const date = new Date().toISOString().slice(0, 10)
  return new NextResponse(toCsv([header, ...rows]), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="zakaznici-${date}.csv"`, 'Cache-Control': 'private, no-store' },
  })
}
