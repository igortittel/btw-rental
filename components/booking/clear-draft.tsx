'use client'

import { useEffect } from 'react'
import { BOOKING_DRAFT_KEY } from './booking-form'

/** Removes the saved form draft once the booking has been sent. */
export function ClearBookingDraft() {
  useEffect(() => {
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_KEY)
    } catch {
      // storage unavailable
    }
  }, [])
  return null
}
