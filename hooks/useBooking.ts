'use client'

import { useState, useCallback, useMemo } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { ADDON_SERVICES, DEFAULT_CONTACT_INFO, type AddonService, type ContactInfo, type Vehicle } from '@/types'
import { getPricePerDay } from '@/lib/utils'

export const EXCESS_KM_FEE   = 0.62
export const KM_DAILY_LIMIT  = 300
export const DEPOSIT_AMOUNT  = 1000
export const TOTAL_STEPS     = 4

export interface PriceBreakdown {
  numberOfDays:  number
  pricePerDay:   number
  baseCost:      number
  addonsCost:    number  // sum of (price/day × days) for selected addons
  total:         number
}

export interface BookingCheckboxes {
  deposit:        boolean
  mileageLimit:   boolean
  termsOfService: boolean
  privacyPolicy:  boolean
}

export interface BookingState {
  vehicle:         Vehicle | null
  pickupDate:      Date | null
  dropoffDate:     Date | null
  pickupTime:      string
  dropoffTime:     string
  pickupLocation:  string
  dropoffLocation: string
  notes:           string
  contactInfo:     ContactInfo
  addonServices:   AddonService[]
  checkboxes:      BookingCheckboxes
  currentStep:     number
}

const freshState = (vehicle?: Vehicle): BookingState => ({
  vehicle:         vehicle ?? null,
  pickupDate:      null,
  dropoffDate:     null,
  pickupTime:      '09:00',
  dropoffTime:     '09:00',
  pickupLocation:  '',
  dropoffLocation: '',
  notes:           '',
  contactInfo:     { ...DEFAULT_CONTACT_INFO },
  addonServices:   ADDON_SERVICES.map(s => ({ ...s, selected: false })),
  checkboxes:      { deposit: false, mileageLimit: false, termsOfService: false, privacyPolicy: false },
  currentStep:     1,
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function useBooking(vehicle?: Vehicle) {
  const [state, setState] = useState<BookingState>(() => freshState(vehicle))

  // ── derived ──────────────────────────────────────────────────────────────

  const numberOfDays = useMemo(() => {
    if (!state.pickupDate || !state.dropoffDate) return 0
    return Math.max(differenceInCalendarDays(state.dropoffDate, state.pickupDate), 1)
  }, [state.pickupDate, state.dropoffDate])

  const priceBreakdown = useMemo((): PriceBreakdown => {
    const pricePerDay = state.vehicle ? getPricePerDay(state.vehicle, numberOfDays) : 0
    const baseCost    = pricePerDay * numberOfDays
    // addons are priced per day
    const addonsCost  = state.addonServices
      .filter(s => s.selected)
      .reduce((sum, s) => sum + s.price * numberOfDays, 0)
    return { numberOfDays, pricePerDay, baseCost, addonsCost, total: baseCost + addonsCost }
  }, [state.vehicle, numberOfDays, state.addonServices])

  const allCheckboxesChecked = useMemo(
    () => Object.values(state.checkboxes).every(Boolean),
    [state.checkboxes]
  )

  const isStep1Valid = useMemo(
    () => !!state.pickupDate && !!state.dropoffDate && numberOfDays > 0,
    [state.pickupDate, state.dropoffDate, numberOfDays]
  )

  const isEmailValid = useMemo(
    () => EMAIL_RE.test(state.contactInfo.email),
    [state.contactInfo.email]
  )

  const isStep2Valid = useMemo(() => {
    const { contactInfo: c, pickupLocation, dropoffLocation } = state
    const baseValid = isEmailValid && !!c.phone && !!pickupLocation && !!dropoffLocation
    const nameValid = !!c.first_name && !!c.last_name
    if (c.customer_type === 'business') return baseValid && nameValid && !!c.company_name && !!c.ico
    return baseValid && nameValid
  }, [state, isEmailValid])

  // ── helpers ───────────────────────────────────────────────────────────────

  const buildDatetime = useCallback((date: Date | null, time: string): Date | null => {
    if (!date) return null
    const [h, m] = time.split(':').map(Number)
    const dt = new Date(date)
    dt.setHours(h, m, 0, 0)
    return dt
  }, [])

  const getPickupDatetime  = useCallback(
    () => buildDatetime(state.pickupDate, state.pickupTime),
    [buildDatetime, state.pickupDate, state.pickupTime]
  )
  const getDropoffDatetime = useCallback(
    () => buildDatetime(state.dropoffDate, state.dropoffTime),
    [buildDatetime, state.dropoffDate, state.dropoffTime]
  )

  // ── setters ───────────────────────────────────────────────────────────────

  const setVehicle         = useCallback((v: Vehicle) => setState(p => ({ ...p, vehicle: v })), [])
  const setPickupDate      = useCallback((d: Date | null) => setState(p => ({ ...p, pickupDate: d })), [])
  const setDropoffDate     = useCallback((d: Date | null) => setState(p => ({ ...p, dropoffDate: d })), [])
  const setPickupTime      = useCallback((t: string) => setState(p => ({ ...p, pickupTime: t })), [])
  const setDropoffTime     = useCallback((t: string) => setState(p => ({ ...p, dropoffTime: t })), [])
  const setPickupLocation  = useCallback((l: string) => setState(p => ({ ...p, pickupLocation: l })), [])
  const setDropoffLocation = useCallback((l: string) => setState(p => ({ ...p, dropoffLocation: l })), [])
  const setNotes           = useCallback((n: string) => setState(p => ({ ...p, notes: n })), [])

  const setContactField = useCallback(<K extends keyof ContactInfo>(key: K, value: ContactInfo[K]) => {
    setState(p => ({ ...p, contactInfo: { ...p.contactInfo, [key]: value } }))
  }, [])

  const prefillContact = useCallback((info: Partial<ContactInfo>) => {
    setState(p => ({ ...p, contactInfo: { ...p.contactInfo, ...info } }))
  }, [])

  const toggleAddon = useCallback((id: string) => {
    setState(p => ({
      ...p,
      addonServices: p.addonServices.map(s => s.id === id ? { ...s, selected: !s.selected } : s),
    }))
  }, [])

  const setCheckbox = useCallback((key: keyof BookingCheckboxes, value: boolean) => {
    setState(p => ({ ...p, checkboxes: { ...p.checkboxes, [key]: value } }))
  }, [])

  const nextStep = useCallback(() => setState(p => ({ ...p, currentStep: Math.min(p.currentStep + 1, TOTAL_STEPS) })), [])
  const prevStep = useCallback(() => setState(p => ({ ...p, currentStep: Math.max(p.currentStep - 1, 1) })), [])
  const reset    = useCallback(() => setState(freshState(vehicle)), [vehicle])

  return {
    state, numberOfDays, priceBreakdown,
    allCheckboxesChecked, isStep1Valid, isStep2Valid, isEmailValid,
    setVehicle, setPickupDate, setDropoffDate, setPickupTime, setDropoffTime,
    setPickupLocation, setDropoffLocation, setNotes,
    setContactField, prefillContact,
    toggleAddon, setCheckbox, nextStep, prevStep, reset,
    getPickupDatetime, getDropoffDatetime,
    EXCESS_KM_FEE, KM_DAILY_LIMIT, DEPOSIT_AMOUNT, TOTAL_STEPS,
  }
}
