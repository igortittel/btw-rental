'use client'

import { useEffect, useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format, parseISO, eachDayOfInterval } from 'date-fns'
import {
  Calendar, CheckCircle2, Clock, XCircle, Car,
  User, CalendarDays, ArrowLeft, Plus, Filter,
} from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }    from '@/components/ui/badge'
import OccupancyCalendar from '@/components/OccupancyCalendar'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, getStatusColor, getStatusLabel } from '@/lib/utils'
import { type Booking, type BookingStatus } from '@/types'

type StatusFilter = 'all' | BookingStatus

const STATUS_TABS: { key: StatusFilter; label: string; icon: typeof Car }[] = [
  { key: 'all',       label: 'All',       icon: Car },
  { key: 'pending',   label: 'Pending',   icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle2 },
  { key: 'active',    label: 'Active',    icon: Car },
  { key: 'completed', label: 'Completed', icon: CheckCircle2 },
  { key: 'cancelled', label: 'Cancelled', icon: XCircle },
]

export default function AdminBookingsPage() {
  const router = useRouter()
  const [bookings,        setBookings]        = useState<Booking[]>([])
  const [filter,          setFilter]          = useState<StatusFilter>('all')
  const [loading,         setLoading]         = useState(true)
  const [allBookings,     setAllBookings]     = useState<any[]>([])
  const [vehicles,        setVehicles]        = useState<{ id: string; name: string; plate: string }[]>([])

  const [dateFrom,        setDateFrom]        = useState('')
  const [dateTo,          setDateTo]          = useState('')
  const [vehicleIdFilter, setVehicleIdFilter] = useState('all')

  useEffect(() => {
    createClient()
      .from('vehicles').select('id, name, plate').order('brand')
      .then(({ data }) => setVehicles((data ?? []) as any[]))
  }, [])

  async function load(status?: string) {
    setLoading(true)
    const supabase = createClient()
    try { await supabase.rpc('update_booking_statuses') } catch (_) {}
    let q = supabase
      .from('bookings')
      .select('*, vehicle:vehicles(name, plate)')
      .order('pickup_datetime', { ascending: false })
    if (status && status !== 'all')    q = q.eq('status', status)
    if (dateFrom)                      q = q.gte('pickup_datetime', `${dateFrom}T00:00:00`)
    if (dateTo)                        q = q.lte('pickup_datetime', `${dateTo}T23:59:59`)
    if (vehicleIdFilter !== 'all')     q = q.eq('vehicle_id', vehicleIdFilter)
    const { data } = await q
    setBookings((data ?? []) as Booking[])
    setLoading(false)
  }

  useEffect(() => { load(filter) }, [filter, dateFrom, dateTo, vehicleIdFilter])

  useEffect(() => {
    createClient()
      .from('bookings')
      .select('id, booking_number, vehicle_id, pickup_datetime, dropoff_datetime, status, vehicle:vehicles(name, plate)')
      .in('status', ['pending', 'confirmed', 'active'])
      .then(({ data }) => setAllBookings(data ?? []))
  }, [bookings])

  const counts = useMemo(() => ({
    all:       bookings.length,
    pending:   bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    active:    bookings.filter(b => b.status === 'active').length,
    completed: bookings.filter(b => b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  }), [bookings])

  const completedRevenue = useMemo(
    () => bookings.filter(b => b.status === 'completed').reduce((s, b) => s + b.total_price, 0),
    [bookings]
  )

  const occupancyData = useMemo(() => {
    const result: Record<string, any[]> = {}
    for (const b of allBookings) {
      try {
        const days = eachDayOfInterval({ start: parseISO(b.pickup_datetime), end: parseISO(b.dropoff_datetime) })
        for (const day of days) {
          const key = format(day, 'yyyy-MM-dd')
          if (!result[key]) result[key] = []
          result[key].push({
            vehicleName: b.vehicle?.name ?? '',
            vehicleId: b.vehicle_id,
            bookingId: b.booking_number,
            status: b.status,
          })
        }
      } catch {}
    }
    return result
  }, [allBookings])

  const vehicleList = useMemo(() => {
    const seen = new Set<string>()
    const list: { id: string; name: string; plate: string }[] = []
    for (const b of allBookings) {
      if (b.vehicle_id && !seen.has(b.vehicle_id)) {
        seen.add(b.vehicle_id)
        list.push({ id: b.vehicle_id, name: b.vehicle?.name ?? '', plate: b.vehicle?.plate ?? '' })
      }
    }
    return list
  }, [allBookings])

  const hasActiveFilters = dateFrom || dateTo || vehicleIdFilter !== 'all'

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-gold transition-colors mb-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Overview
            </Link>
            <h1 className="text-3xl font-black font-montserrat text-white">Bookings</h1>
          </div>
          <Button asChild>
            <Link href="/admin/bookings/new"><Plus className="h-4 w-4" /> New Booking</Link>
          </Button>
        </div>

        {/* Filters */}
        <Card className="border-zinc-800 bg-zinc-900/40 mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500 whitespace-nowrap">Pickup from</label>
                <input
                  type="date" value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  className="h-8 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500">to</label>
                <input
                  type="date" value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  className="h-8 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50"
                />
              </div>
              <select
                value={vehicleIdFilter}
                onChange={e => setVehicleIdFilter(e.target.value)}
                className="h-8 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50 cursor-pointer"
              >
                <option value="all">All Vehicles</option>
                {vehicles.map(v => (
                  <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>
                ))}
              </select>
              {hasActiveFilters && (
                <button
                  onClick={() => { setDateFrom(''); setDateTo(''); setVehicleIdFilter('all') }}
                  className="text-xs text-zinc-500 hover:text-gold transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Revenue summary */}
        <Card className="border-zinc-800 bg-zinc-900/60 mb-4">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Completed Revenue</p>
                <p className="text-2xl font-black font-montserrat text-gold">{formatCurrency(completedRevenue)}</p>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-4 text-center">
                {(['pending','confirmed','active','completed','cancelled'] as const).map(s => (
                  <div key={s}>
                    <p className="text-xl font-black font-montserrat text-white">{counts[s]}</p>
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">{getStatusLabel(s)}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Status tabs */}
        <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 mb-6 overflow-x-auto">
          {STATUS_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                filter === tab.key ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.key !== 'all' && (
                <span className="ml-0.5 opacity-60">({counts[tab.key as BookingStatus]})</span>
              )}
            </button>
          ))}
        </div>

        {/* Bookings table */}
        <Card className="border-zinc-800 bg-zinc-900/50 mb-8">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-6 w-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            ) : bookings.length === 0 ? (
              <p className="py-16 text-center text-zinc-500">No bookings match the current filter.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3">Booking #</th>
                      <th className="px-4 py-3">Customer</th>
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Dates</th>
                      <th className="px-4 py-3">Total</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {bookings.map(b => (
                      <tr
                        key={b.id}
                        onClick={() => router.push(`/admin/bookings/${b.booking_number}`)}
                        className="hover:bg-zinc-800/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <p className="font-mono text-xs text-gold">{b.booking_number}</p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">{new Date(b.created_at).toLocaleDateString()}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-start gap-2">
                            <User className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-medium text-white">
                                {b.contact_info_json?.customer_type === 'private'
                                  ? `${b.contact_info_json.first_name} ${b.contact_info_json.last_name}`
                                  : b.contact_info_json?.company_name || '—'}
                              </p>
                              <p className="text-xs text-zinc-500">{b.contact_info_json?.phone || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{b.vehicle?.name ?? '—'}</p>
                          <p className="text-xs text-zinc-500 font-mono">{b.vehicle?.plate ?? '—'}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-400">
                          <div className="flex items-start gap-1">
                            <Calendar className="h-3.5 w-3.5 text-gold/50 mt-0.5 shrink-0" />
                            <div>
                              <p>{formatDateTime(b.pickup_datetime)}</p>
                              <p className="text-zinc-600">→ {formatDateTime(b.dropoff_datetime)}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-bold font-montserrat text-gold">
                          {formatCurrency(b.total_price)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={`text-[10px] ${getStatusColor(b.status)}`}>
                            {getStatusLabel(b.status)}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Occupancy Calendar */}
        {vehicleList.length > 0 && (
          <Card className="border-zinc-800 bg-zinc-900/50">
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
        )}
      </div>
    </div>
  )
}
