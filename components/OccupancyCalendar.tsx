'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, format, isSameMonth, isToday, getDay,
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BookingEntry {
  vehicleName: string
  vehicleId:   string
  bookingId:   string
  status:      string
}

interface OccupancyCalendarProps {
  data:             Record<string, BookingEntry[]>
  vehicles:         { id: string; name: string; plate: string }[]
  bookingLinkBase?: string
}

const VEHICLE_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500',
  'bg-orange-500', 'bg-pink-500', 'bg-cyan-500',
]
const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function OccupancyCalendar({
  data, vehicles, bookingLinkBase = '/dashboard/bookings/',
}: OccupancyCalendarProps) {
  const router = useRouter()
  const [currentMonth, setCurrentMonth]           = useState(new Date())
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('all')

  const vehicleColorMap = Object.fromEntries(
    vehicles.map((v, i) => [v.id, VEHICLE_COLORS[i % VEHICLE_COLORS.length]])
  )

  const filteredData = useMemo(() => {
    if (selectedVehicleId === 'all') return data
    const result: Record<string, BookingEntry[]> = {}
    for (const [date, entries] of Object.entries(data)) {
      const filtered = entries.filter(e => e.vehicleId === selectedVehicleId)
      if (filtered.length > 0) result[date] = filtered
    }
    return result
  }, [data, selectedVehicleId])

  const monthStart  = startOfMonth(currentMonth)
  const monthEnd    = endOfMonth(currentMonth)
  const days        = eachDayOfInterval({ start: monthStart, end: monthEnd })
  const startDow    = (getDay(monthStart) + 6) % 7
  const paddingDays = Array.from({ length: startDow })

  const totalOccupied = Object.keys(filteredData).filter(d => {
    const date = new Date(d)
    return isSameMonth(date, currentMonth) && (filteredData[d]?.length ?? 0) > 0
  }).length

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Month navigation */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentMonth(m => subMonths(m, 1))}
            className="h-8 w-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="text-center min-w-[140px]">
            <h3 className="font-bold font-montserrat text-white">
              {format(currentMonth, 'MMMM yyyy')}
            </h3>
            <p className="text-xs text-zinc-500">{totalOccupied} occupied day{totalOccupied !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setCurrentMonth(m => addMonths(m, 1))}
            className="h-8 w-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Vehicle filter */}
        <select
          value={selectedVehicleId}
          onChange={e => setSelectedVehicleId(e.target.value)}
          className="h-8 rounded-md border border-zinc-700 bg-zinc-900 text-xs text-zinc-300 px-2 focus:outline-none focus:ring-1 focus:ring-gold/50 cursor-pointer"
        >
          <option value="all">All Vehicles</option>
          {vehicles.map(v => (
            <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>
          ))}
        </select>
      </div>

      {/* Vehicle legend */}
      <div className="flex flex-wrap gap-3">
        {(selectedVehicleId === 'all' ? vehicles : vehicles.filter(v => v.id === selectedVehicleId)).map(v => (
          <div key={v.id} className="flex items-center gap-1.5 text-xs text-zinc-400">
            <span className={cn('h-2.5 w-2.5 rounded-full', vehicleColorMap[v.id])} />
            <span>{v.name}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-zinc-800">
          {DAY_HEADERS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {paddingDays.map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[72px] border-b border-r border-zinc-800/50 bg-zinc-950/30 last:border-r-0" />
          ))}
          {days.map((day, i) => {
            const key      = format(day, 'yyyy-MM-dd')
            const entries  = filteredData[key] ?? []
            const today    = isToday(day)
            const isLast   = (paddingDays.length + i + 1) % 7 === 0

            return (
              <div
                key={key}
                className={cn(
                  'min-h-[72px] p-1.5 border-b border-zinc-800/50 transition-colors',
                  !isLast && 'border-r',
                  entries.length > 0 ? 'bg-zinc-900/60' : 'bg-transparent',
                  today && 'ring-1 ring-inset ring-gold/40'
                )}
              >
                <span className={cn(
                  'text-xs font-semibold inline-flex h-5 w-5 items-center justify-center rounded-full mb-1',
                  today ? 'bg-gold text-rich-black' : 'text-zinc-400'
                )}>
                  {format(day, 'd')}
                </span>
                <div className="space-y-0.5">
                  {entries.slice(0, 3).map((entry, j) => (
                    <button
                      key={`${entry.bookingId}-${j}`}
                      onClick={() => router.push(`${bookingLinkBase}${entry.bookingId}`)}
                      className={cn(
                        'flex items-center gap-1 rounded px-1 py-0.5 w-full text-left hover:opacity-80 transition-opacity cursor-pointer',
                        vehicleColorMap[entry.vehicleId] + '/20'
                      )}
                      title={`${entry.vehicleName} — click to view booking`}
                    >
                      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', vehicleColorMap[entry.vehicleId])} />
                      <span className="text-[9px] text-zinc-300 truncate leading-tight">
                        {entry.vehicleName.split(' ').slice(-1)[0]}
                      </span>
                    </button>
                  ))}
                  {entries.length > 3 && (
                    <p className="text-[9px] text-zinc-500 px-1">+{entries.length - 3}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
