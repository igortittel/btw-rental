import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { BookingStatus, Vehicle } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-EU', { style: 'currency', currency }).format(amount)
}

export function formatDate(dateStr: string) {
  return format(parseISO(dateStr), 'dd MMM yyyy')
}

export function formatDateTime(dateStr: string) {
  return format(parseISO(dateStr), 'dd MMM yyyy, HH:mm')
}

export function daysUntil(dateStr: string): number {
  return differenceInCalendarDays(parseISO(dateStr), new Date())
}

export function generateTimeSlots(intervalMinutes = 30): string[] {
  const slots: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += intervalMinutes) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'confirmed': return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10'
    case 'active':    return 'text-blue-400 border-blue-400/30 bg-blue-400/10'
    case 'pending':   return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
    case 'completed': return 'text-zinc-400 border-zinc-400/30 bg-zinc-400/10'
    case 'cancelled': return 'text-red-400 border-red-400/30 bg-red-400/10'
    default:          return 'text-zinc-400 border-zinc-400/30 bg-zinc-400/10'
  }
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending', confirmed: 'Confirmed', active: 'Active',
    completed: 'Completed', cancelled: 'Cancelled',
  }
  return labels[status] ?? status
}

export function getRemainingDaysColor(days: number): string {
  if (days < 0)  return 'text-red-500'
  if (days < 30) return 'text-red-400'
  if (days < 60) return 'text-yellow-400'
  return 'text-emerald-400'
}

export function getPricePerDay(vehicle: Vehicle, days: number): number {
  const tiers = vehicle.price_tiers_json ?? []
  if (!tiers.length) return vehicle.daily_price
  const tier = tiers.find(t => days >= t.min_days && days <= t.max_days)
  return tier?.price_per_day ?? vehicle.daily_price
}

export function getMinPricePerDay(vehicle: Vehicle): number {
  const tiers = vehicle.price_tiers_json ?? []
  if (!tiers.length) return vehicle.daily_price
  return Math.min(...tiers.map(t => t.price_per_day))
}

export function getCancellationFeePct(pickupDatetime: string): number {
  const days = differenceInCalendarDays(parseISO(pickupDatetime), new Date())
  if (days >= 7) return 0
  if (days >= 3) return 25
  if (days >= 1) return 50
  return 100
}

export function getCancellationFee(totalPrice: number, pickupDatetime: string): number {
  return totalPrice * getCancellationFeePct(pickupDatetime) / 100
}

export function canCancelFree(pickupDatetime: string): boolean {
  return differenceInCalendarDays(parseISO(pickupDatetime), new Date()) >= 7
}
