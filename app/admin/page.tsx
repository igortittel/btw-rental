import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format, subDays, addDays, parseISO, eachDayOfInterval } from 'date-fns'
import { ArrowRight, Car, Wrench, CalendarDays, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import OccupancyCalendar from '@/components/OccupancyCalendar'
import AdminDateFilter from '@/components/AdminDateFilter'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDateTime, getStatusColor, daysUntil } from '@/lib/utils'
import type { Booking, Vehicle, Maintenance } from '@/types'

export const metadata = { title: 'Admin — Overview' }

interface Props {
  searchParams: Promise<{ from?: string; to?: string }>
}

export default async function AdminPage({ searchParams }: Props) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.user_metadata as Record<string,string>)?.role !== 'admin') redirect('/auth/login')

  const { from, to } = await searchParams
  const dateFrom = from ?? format(new Date(), 'yyyy-MM-dd')
  const dateTo   = to   ?? format(addDays(new Date(), 30), 'yyyy-MM-dd')

  const [
    { data: confirmedRaw },
    { data: nearestRaw },
    { data: vehiclesRaw },
    { data: maintenanceRaw },
    { data: calendarBookingsRaw },
  ] = await Promise.all([
    supabase
      .from('bookings')
      .select('id')
      .eq('status', 'confirmed')
      .gte('pickup_datetime', `${dateFrom}T00:00:00`)
      .lte('pickup_datetime', `${dateTo}T23:59:59`),
    supabase
      .from('bookings')
      .select('*, vehicle:vehicles(name, plate)')
      .in('status', ['pending', 'confirmed'])
      .gte('pickup_datetime', new Date().toISOString())
      .order('pickup_datetime', { ascending: true })
      .limit(5),
    supabase.from('vehicles').select('*').order('daily_price', { ascending: false }),
    supabase.from('maintenance').select('expiration_date').order('expiration_date'),
    supabase
      .from('bookings')
      .select('id, booking_number, vehicle_id, pickup_datetime, dropoff_datetime, status, vehicle:vehicles(name, plate)')
      .in('status', ['pending', 'confirmed']),
  ])

  const vehicles    = (vehiclesRaw ?? []) as Vehicle[]
  const maintenance = (maintenanceRaw ?? []) as Pick<Maintenance, 'expiration_date'>[]
  const nearest     = (nearestRaw ?? []) as (Booking & { vehicle?: { name: string; plate: string } })[]

  const criticalCount = maintenance.filter(m => daysUntil(m.expiration_date) < 30).length
  const confirmedCount = confirmedRaw?.length ?? 0

  // Build occupancy data for calendar (link by booking_number)
  type BookingEntry = { vehicleName: string; vehicleId: string; bookingId: string; status: string }
  const occupancyData: Record<string, BookingEntry[]> = {}
  for (const b of (calendarBookingsRaw ?? []) as any[]) {
    try {
      const days = eachDayOfInterval({ start: parseISO(b.pickup_datetime), end: parseISO(b.dropoff_datetime) })
      for (const day of days) {
        const key = format(day, 'yyyy-MM-dd')
        if (!occupancyData[key]) occupancyData[key] = []
        occupancyData[key].push({
          vehicleName: b.vehicle?.name ?? '',
          vehicleId: b.vehicle_id,
          bookingId: b.booking_number,
          status: b.status,
        })
      }
    } catch {}
  }

  const vehicleList = vehicles.map(v => ({ id: v.id, name: v.name, plate: v.plate }))

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(184,135,70,0.03)_0%,transparent_50%)] pointer-events-none" />
      <div className="container mx-auto px-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-1">Admin</Badge>
            <h1 className="text-3xl font-black font-montserrat text-white">Overview</h1>
          </div>
          <div />
        </div>

        {/* ── RESERVATIONS ── */}
        <Card className="border-zinc-800 bg-zinc-900/50 mb-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-gold" /> Reservations
              </CardTitle>
              <AdminDateFilter defaultFrom={dateFrom} defaultTo={dateTo} />
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Stat */}
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 p-4">
              <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
                Confirmed in period ({dateFrom} → {dateTo})
              </p>
              <p className="text-5xl font-black font-montserrat text-white">
                {confirmedCount}
                <span className="text-lg font-normal text-zinc-500 ml-2">confirmed bookings</span>
              </p>
            </div>

            {/* 5 nearest */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Next 5 upcoming
              </p>
              {nearest.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">No upcoming reservations.</p>
              ) : (
                <div className="space-y-1.5">
                  {nearest.map(b => (
                    <Link
                      key={b.id}
                      href={`/admin/bookings/${b.booking_number}`}
                      className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/30 transition-all group"
                    >
                      <div>
                        <p className="text-sm font-semibold text-white">{b.vehicle?.name ?? '—'}</p>
                        <p className="text-xs text-zinc-500">{formatDateTime(b.pickup_datetime)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-gold text-sm">{formatCurrency(b.total_price)}</span>
                        <Badge className={`text-[10px] ${getStatusColor(b.status)}`}>{b.status}</Badge>
                        <ArrowRight className="h-4 w-4 text-zinc-600 group-hover:text-gold transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <Button asChild variant="outline" size="sm">
              <Link href="/admin/bookings">Show Bookings <ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </CardContent>
        </Card>

        {/* ── FLEET STATUS ── */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Link href="/admin/fleet">
            <Card className="border-zinc-800 bg-zinc-900/60 hover:border-gold/30 transition-colors cursor-pointer h-full">
              <CardContent className="p-5 flex items-center gap-4">
                <div className="h-12 w-12 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center shrink-0">
                  <Car className="h-6 w-6 text-gold" />
                </div>
                <div>
                  <p className="text-4xl font-black font-montserrat text-white">{vehicles.length}</p>
                  <p className="text-sm text-zinc-400">Total Vehicles</p>
                  <p className="text-xs text-zinc-600 mt-0.5">
                    {vehicles.filter(v => v.is_available).length} available
                  </p>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/admin/maintenance">
            <Card className={cn(
              'border transition-colors cursor-pointer h-full',
              criticalCount > 0
                ? 'border-red-500/30 bg-red-950/20 hover:border-red-500/50'
                : 'border-zinc-800 bg-zinc-900/60 hover:border-gold/30'
            )}>
              <CardContent className="p-5 flex items-center gap-4">
                <div className={cn(
                  'h-12 w-12 rounded-xl border flex items-center justify-center shrink-0',
                  criticalCount > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-gold/10 border-gold/20'
                )}>
                  <Wrench className={cn('h-6 w-6', criticalCount > 0 ? 'text-red-400' : 'text-gold')} />
                </div>
                <div>
                  <p className={cn('text-4xl font-black font-montserrat', criticalCount > 0 ? 'text-red-400' : 'text-white')}>
                    {criticalCount}
                  </p>
                  <p className="text-sm text-zinc-400">Maintenance Due</p>
                  <p className="text-xs text-zinc-600 mt-0.5">expiring within 30 days</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* ── OCCUPANCY CALENDAR ── */}
        <Card className="border-zinc-800 bg-zinc-900/50 mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-gold" /> Fleet Occupancy Calendar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OccupancyCalendar
              data={occupancyData}
              vehicles={vehicleList}
              bookingLinkBase="/admin/bookings/"
            />
          </CardContent>
        </Card>

        {/* ── VEHICLE INVENTORY ── */}
        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Car className="h-4 w-4 text-gold" /> Vehicle Inventory
              </CardTitle>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/fleet">Show All Vehicles <ArrowRight className="h-4 w-4" /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {vehicles.slice(0, 6).map(v => (
                <Link
                  key={v.id}
                  href={`/admin/fleet/${v.vin}`}
                  className="flex items-center gap-3 p-3 rounded-lg border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-800/20 transition-colors group"
                >
                  <div className="h-10 w-10 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <Car className="h-5 w-5 text-gold/60" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white text-sm truncate group-hover:text-gold transition-colors">{v.name}</p>
                    <p className="text-xs text-zinc-500">{v.plate} · {v.year}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-gold">{formatCurrency(v.daily_price)}</p>
                    <Badge
                      variant={v.is_available ? 'success' : 'destructive'}
                      className="text-[10px] mt-0.5"
                    >
                      {v.is_available ? 'Available' : 'Unavailable'}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}
