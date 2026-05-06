'use client'

import { useEffect, useState } from 'react'
import { Clock, MapPin, Calendar } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import type { Booking } from '@/types'

interface CountdownTimerProps {
  booking: Booking
}

interface TimeLeft {
  days: number
  hours: number
  minutes: number
  seconds: number
  expired: boolean
}

function calculateTimeLeft(targetDate: string): TimeLeft {
  const diff = new Date(targetDate).getTime() - Date.now()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  return {
    days:    Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours:   Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  }
}

function TimeBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center">
          <span className="text-2xl sm:text-3xl font-black font-montserrat text-gold tabular-nums">
            {String(value).padStart(2, '0')}
          </span>
        </div>
      </div>
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 mt-2 font-medium">
        {label}
      </span>
    </div>
  )
}

function Colon() {
  return (
    <span className="text-xl font-bold text-gold/40 mb-6 select-none animate-countdown-pulse">:</span>
  )
}

export default function CountdownTimer({ booking }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() =>
    calculateTimeLeft(booking.pickup_datetime)
  )

  useEffect(() => {
    if (timeLeft.expired) return
    const id = setInterval(() => {
      setTimeLeft(calculateTimeLeft(booking.pickup_datetime))
    }, 1000)
    return () => clearInterval(id)
  }, [booking.pickup_datetime, timeLeft.expired])

  if (timeLeft.expired) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
        <p className="text-emerald-400 font-semibold font-montserrat">
          Your trip has started — enjoy the road! 🏎️
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-gold/20 bg-zinc-900/60 p-6">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="h-4 w-4 text-gold" />
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-widest">
          Next Trip Countdown
        </h3>
      </div>

      {/* Countdown display */}
      <div className="flex items-end justify-center gap-2 sm:gap-3 mb-6">
        <TimeBlock value={timeLeft.days}    label="Days" />
        <Colon />
        <TimeBlock value={timeLeft.hours}   label="Hours" />
        <Colon />
        <TimeBlock value={timeLeft.minutes} label="Mins" />
        <Colon />
        <TimeBlock value={timeLeft.seconds} label="Secs" />
      </div>

      {/* Trip info */}
      <div className="space-y-2 pt-4 border-t border-zinc-800">
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <Calendar className="h-4 w-4 text-gold/70 shrink-0" />
          <span>{formatDateTime(booking.pickup_datetime)}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <MapPin className="h-4 w-4 text-gold/70 shrink-0" />
          <span>{booking.pickup_location}</span>
        </div>
        {booking.vehicle && (
          <div className="mt-3 text-sm font-semibold text-white">
            {booking.vehicle.name}
          </div>
        )}
      </div>
    </div>
  )
}
