import type { Database } from '@/types/database'

export type BookingStatus = Database['public']['Enums']['booking_status']

/**
 * Allowed status transitions. Mirrors private.is_valid_status_transition() in the
 * database, which is the authority; this copy lets the UI offer only valid actions.
 */
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['modified', 'active', 'cancelled'],
  modified: ['confirmed', 'cancelled'],
  active: ['completed'],
  completed: [],
  cancelled: [],
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Statuses that occupy the vehicle (same set as the EXCLUDE constraint). */
export const BLOCKING_STATUSES: BookingStatus[] = ['confirmed', 'modified', 'active']

export function isTerminal(status: BookingStatus): boolean {
  return TRANSITIONS[status].length === 0
}

/** A booking can still be edited by staff until it is finished or cancelled. */
export function isEditable(status: BookingStatus): boolean {
  return status === 'new' || status === 'confirmed' || status === 'active'
}
