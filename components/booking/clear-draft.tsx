'use client'

import { useEffect } from 'react'
import { BOOKING_DRAFT_KEY } from './booking-form'

/** Once the booking has been sent: start at the top of the page and remove the saved form draft. */
export function ClearBookingDraft() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    try {
      sessionStorage.removeItem(BOOKING_DRAFT_KEY)
    } catch {
      // storage unavailable
    }
  }, [])
  return null
}
