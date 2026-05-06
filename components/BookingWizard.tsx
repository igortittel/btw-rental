'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import {
  CalendarDays, UserCircle, ShoppingBag, ClipboardCheck,
  ChevronRight, ChevronLeft, Check, AlertTriangle, Loader2, Mail, Info,
} from 'lucide-react'
import { format, eachDayOfInterval, parseISO } from 'date-fns'
import { Button }    from '@/components/ui/button'
import { Checkbox }  from '@/components/ui/checkbox'
import { Label }     from '@/components/ui/label'
import { Input }     from '@/components/ui/input'
import { Textarea }  from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { useBooking } from '@/hooks/useBooking'
import { formatCurrency, generateTimeSlots, cn, getPricePerDay } from '@/lib/utils'
import type { Vehicle } from '@/types'

const STEPS = [
  { icon: CalendarDays,   label: 'Dates' },
  { icon: UserCircle,     label: 'Details' },
  { icon: ShoppingBag,    label: 'Add-ons' },
  { icon: ClipboardCheck, label: 'Confirm' },
]

const CHECKBOXES = [
  {
    key: 'deposit' as const,
    label: 'Refundable Security Deposit',
    description: 'A refundable deposit of €1,000 will be pre-authorised at pickup and released within 7 business days after return.',
  },
  {
    key: 'mileageLimit' as const,
    label: 'Mileage Limit — 300 km/day',
    description: 'I acknowledge the 300 km/day mileage limit. Excess kilometres are charged at €0.62/km.',
  },
  {
    key: 'termsOfService' as const,
    label: 'Terms of Service',
    description: 'I have read and accept the By The Wave Terms of Service.',
  },
  {
    key: 'privacyPolicy' as const,
    label: 'Privacy Policy (GDPR)',
    description: 'I consent to processing of my personal data per GDPR.',
  },
]

const TIME_SLOTS = generateTimeSlots(30)

export default function BookingWizard({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [bookedDays, setBookedDays]  = useState<Date[]>([])
  const [error, setError]    = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [emailTouched, setEmailTouched] = useState(false)

  const {
    state, numberOfDays, priceBreakdown, allCheckboxesChecked, isStep1Valid, isStep2Valid, isEmailValid,
    setPickupDate, setDropoffDate, setPickupTime, setDropoffTime,
    setPickupLocation, setDropoffLocation, setNotes,
    setContactField, prefillContact,
    toggleAddon, setCheckbox, nextStep, prevStep,
    getPickupDatetime, getDropoffDatetime,
    DEPOSIT_AMOUNT, KM_DAILY_LIMIT, EXCESS_KM_FEE,
  } = useBooking(vehicle)

  const { contactInfo } = state

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase.rpc('get_booked_ranges', { p_vehicle_id: vehicle.id })
      if (data) {
        setBookedDays(
          (data as { pickup: string; dropoff: string }[]).flatMap(r =>
            eachDayOfInterval({ start: parseISO(r.pickup), end: parseISO(r.dropoff) })
          )
        )
      }
    }
    load()
  }, [vehicle.id])

  useEffect(() => {
    async function prefill() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('full_name, phone').eq('id', user.id).single()
      const parts = (profile?.full_name ?? '').split(' ')
      prefillContact({
        email:      user.email ?? '',
        first_name: parts[0] ?? '',
        last_name:  parts.slice(1).join(' '),
        phone:      profile?.phone ?? '',
      })
    }
    prefill()
  }, [prefillContact])

  const handleSubmit = async () => {
    setError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const pickupDt  = getPickupDatetime()
    const dropoffDt = getDropoffDatetime()
    if (!pickupDt || !dropoffDt) return

    startTransition(async () => {
      const { error: insertError } = await supabase.from('bookings').insert({
        user_id:             user?.id ?? null,
        vehicle_id:          vehicle.id,
        pickup_datetime:     pickupDt.toISOString(),
        dropoff_datetime:    dropoffDt.toISOString(),
        status:              'pending',
        pickup_location:     state.pickupLocation,
        dropoff_location:    state.dropoffLocation,
        notes:               state.notes || null,
        total_price:         priceBreakdown.total,
        addon_services_json: state.addonServices.filter(s => s.selected),
        contact_info_json:   state.contactInfo,
        document_urls:       [],
      })
      if (insertError) { setError(insertError.message); return }

      if (!user) {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email: contactInfo.email,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?redirect=/dashboard`,
            shouldCreateUser: true,
          },
        })
        if (otpError) { setError(otpError.message); return }
        setOtpSent(true)
      } else {
        setSuccess(true)
        setTimeout(() => router.push('/dashboard'), 2000)
      }
    })
  }

  // ── Step indicators ───────────────────────────────────────────────────────

  const StepIndicators = () => (
    <div className="relative grid grid-cols-4 mb-8">
      {/* Connecting lines behind circles */}
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={cn('absolute top-[18px] h-px transition-colors', state.currentStep > i + 1 ? 'bg-gold/60' : 'bg-zinc-800')}
          style={{ left: `${12.5 + i * 25}%`, width: '25%' }}
        />
      ))}
      {STEPS.map((step, i) => {
        const num    = i + 1
        const active = state.currentStep === num
        const done   = state.currentStep > num
        const Icon   = step.icon
        return (
          <div key={step.label} className="flex flex-col items-center gap-1.5 relative z-10">
            <div className={cn(
              'h-9 w-9 rounded-full flex items-center justify-center border-2 bg-zinc-950 transition-all',
              done   ? 'bg-gold border-gold text-rich-black' :
              active ? 'border-gold text-gold' :
                       'border-zinc-700 text-zinc-600'
            )}>
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </div>
            <span className={cn(
              'text-[10px] font-semibold uppercase tracking-wider text-center',
              active ? 'text-gold' : done ? 'text-zinc-400' : 'text-zinc-600'
            )}>
              {step.label}
            </span>
          </div>
        )
      })}
    </div>
  )

  if (success) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="h-16 w-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
        <Check className="h-8 w-8 text-emerald-400" />
      </div>
      <h3 className="text-xl font-bold font-montserrat text-white">Booking Submitted!</h3>
      <p className="text-zinc-400 text-sm max-w-xs">Your reservation is pending confirmation. Redirecting…</p>
    </div>
  )

  if (otpSent) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="h-16 w-16 rounded-full bg-gold/10 border border-gold/30 flex items-center justify-center">
        <Mail className="h-8 w-8 text-gold" />
      </div>
      <h3 className="text-xl font-bold font-montserrat text-white">Booking Submitted!</h3>
      <p className="text-zinc-400 text-sm max-w-xs">
        We sent a sign-in link to <strong className="text-gold">{contactInfo.email}</strong>.
        Click it to confirm your account and view your reservation.
      </p>
    </div>
  )

  return (
    <div className="w-full">
      <StepIndicators />

      {/* ── STEP 1: Dates & Time ── */}
      {state.currentStep === 1 && (
        <div className="space-y-5">
          <div className="flex justify-center">
            <DayPicker
              mode="range"
              selected={{ from: state.pickupDate ?? undefined, to: state.dropoffDate ?? undefined }}
              onSelect={r => { setPickupDate(r?.from ?? null); setDropoffDate(r?.to ?? null) }}
              disabled={[{ before: new Date() }, ...bookedDays]}
              modifiers={{ booked: bookedDays }}
              modifiersStyles={{ booked: { textDecoration: 'line-through', color: '#ef4444', opacity: 0.5 } }}
              classNames={{
                day_selected: '!bg-gold !text-rich-black font-bold',
                day_range_middle: '!bg-gold/20 !text-gold',
                day_range_start: '!bg-gold !text-rich-black font-bold rounded-l-full',
                day_range_end: '!bg-gold !text-rich-black font-bold rounded-r-full',
                day_today: 'border border-gold/40',
                day_disabled: 'opacity-30 cursor-not-allowed',
                nav_button: 'text-gold hover:bg-gold/10 rounded-md',
                caption: 'text-white font-montserrat font-semibold',
              }}
              styles={{ root: { color: '#d4d4d4' } }}
            />
          </div>

          {state.pickupDate && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Pickup Time</Label>
                <Select value={state.pickupTime} onValueChange={setPickupTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Dropoff Time</Label>
                <Select value={state.dropoffTime} onValueChange={setDropoffTime}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Summary with live total */}
          {state.pickupDate && state.dropoffDate && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-400">Pickup</span>
                <span className="text-zinc-300">{format(state.pickupDate, 'dd MMM yyyy')} · {state.pickupTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Dropoff</span>
                <span className="text-zinc-300">{format(state.dropoffDate, 'dd MMM yyyy')} · {state.dropoffTime}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-zinc-400">Duration</span>
                <span className="text-white font-semibold">{numberOfDays} day{numberOfDays !== 1 ? 's' : ''}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Price / day</span>
                <span className="text-gold font-semibold">{formatCurrency(getPricePerDay(vehicle, numberOfDays))}</span>
              </div>
              <Separator />
              <div className="flex justify-between items-center">
                <span className="text-white font-bold">Total Price</span>
                <span className="text-xl font-black font-montserrat text-gold">
                  {formatCurrency(priceBreakdown.baseCost)}
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-yellow-500/80 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Limit: {KM_DAILY_LIMIT} km/day · Excess: {formatCurrency(EXCESS_KM_FEE)}/km
          </div>

          <Button onClick={nextStep} disabled={!isStep1Valid} className="w-full" size="lg">
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* ── STEP 2: Personal Info + Locations ── */}
      {state.currentStep === 2 && (
        <div className="space-y-4">
          {/* Private / Business toggle */}
          <div className="flex gap-1 bg-zinc-950 rounded-lg p-1 w-fit">
            {(['private', 'business'] as const).map(type => (
              <button
                key={type}
                onClick={() => setContactField('customer_type', type)}
                className={cn(
                  'px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors',
                  contactInfo.customer_type === type ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'
                )}
              >
                {type === 'private' ? 'Private' : 'Business'}
              </button>
            ))}
          </div>

          {/* Name fields — always visible */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name *</Label>
              <Input
                placeholder="John"
                value={contactInfo.first_name}
                onChange={e => setContactField('first_name', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name *</Label>
              <Input
                placeholder="Doe"
                value={contactInfo.last_name}
                onChange={e => setContactField('last_name', e.target.value)}
              />
            </div>
          </div>

          {/* Business extra fields */}
          {contactInfo.customer_type === 'business' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Company Name *</Label>
                <Input
                  placeholder="Acme s.r.o."
                  value={contactInfo.company_name}
                  onChange={e => setContactField('company_name', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>IČO / VAT *</Label>
                <Input
                  placeholder="12345678"
                  value={contactInfo.ico}
                  onChange={e => setContactField('ico', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email *</Label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={contactInfo.email}
                onChange={e => setContactField('email', e.target.value)}
                onBlur={() => setEmailTouched(true)}
                className={emailTouched && !isEmailValid ? 'border-red-500/60 focus:ring-red-500/40' : ''}
              />
              {emailTouched && !isEmailValid && (
                <p className="text-xs text-red-400">Please enter a valid email address.</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Phone *</Label>
              <Input
                type="tel"
                placeholder="+421 900 000 000"
                value={contactInfo.phone}
                onChange={e => setContactField('phone', e.target.value)}
              />
            </div>
          </div>

          <Separator />

          {/* Pickup / Dropoff — free text */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Pickup Location *</Label>
              <Input
                placeholder="e.g. Bratislava Airport, Hotel Carlton, custom address…"
                value={state.pickupLocation}
                onChange={e => setPickupLocation(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dropoff Location *</Label>
              <Input
                placeholder="e.g. Vienna Airport, same as pickup…"
                value={state.dropoffLocation}
                onChange={e => setDropoffLocation(e.target.value)}
              />
            </div>
            <div className="flex items-start gap-2 text-xs text-blue-400/80 bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <Info className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                Pickup or dropoff <strong>outside Bratislava</strong>? The total price will be adjusted to cover additional vehicle delivery costs. Our team will contact you to confirm.
              </span>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes / Special Requests</Label>
            <Textarea
              placeholder="Flight number, accessibility needs, special requests…"
              value={state.notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={prevStep} className="flex-1" size="lg">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={nextStep} disabled={!isStep2Valid} className="flex-1" size="lg">
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Add-ons ── */}
      {state.currentStep === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm text-zinc-400">Prices are per day · billed for {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}.</p>
          </div>

          <div className="space-y-2">
            {state.addonServices.map(addon => (
              <label
                key={addon.id}
                className={cn(
                  'flex items-center justify-between p-4 rounded-lg border cursor-pointer transition-all',
                  addon.selected ? 'border-gold/60 bg-gold/5' : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                )}
              >
                <div className="flex items-center gap-3">
                  <Checkbox checked={addon.selected} onCheckedChange={() => toggleAddon(addon.id)} />
                  <div>
                    <p className="text-sm font-medium text-white">{addon.name_sk}</p>
                    <p className="text-xs text-zinc-500">{addon.name}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-bold font-montserrat', addon.selected ? 'text-gold' : 'text-zinc-400')}>
                    {formatCurrency(addon.price)}<span className="text-xs font-normal">/day</span>
                  </p>
                  {addon.selected && (
                    <p className="text-xs text-zinc-500">
                      = {formatCurrency(addon.price * numberOfDays)}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {priceBreakdown.addonsCost > 0 && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3 text-sm flex justify-between">
              <span className="text-zinc-400">Add-ons subtotal ({numberOfDays} days)</span>
              <span className="font-bold text-white">{formatCurrency(priceBreakdown.addonsCost)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={prevStep} className="flex-1" size="lg">
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button onClick={nextStep} className="flex-1" size="lg">
              Continue <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Review & Confirm ── */}
      {state.currentStep === 4 && (
        <div className="space-y-4">

          {/* Price breakdown */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-2.5 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Price Breakdown</p>

            <div className="flex justify-between">
              <span className="text-zinc-400">
                {formatCurrency(priceBreakdown.pricePerDay)}/day × {numberOfDays} day{numberOfDays !== 1 ? 's' : ''}
              </span>
              <span className="text-white">{formatCurrency(priceBreakdown.baseCost)}</span>
            </div>

            {/* Expanded add-ons */}
            {state.addonServices.filter(s => s.selected).map(addon => (
              <div key={addon.id} className="flex justify-between text-zinc-400">
                <span>{addon.name_sk} ({formatCurrency(addon.price)}/day × {numberOfDays}d)</span>
                <span>{formatCurrency(addon.price * numberOfDays)}</span>
              </div>
            ))}

            <Separator />
            <div className="flex justify-between items-center">
              <span className="font-bold text-white font-montserrat text-base">Total</span>
              <span className="text-2xl font-black font-montserrat text-gold">
                {formatCurrency(priceBreakdown.total)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-zinc-600">
              <span>Security deposit (pre-authorised at pickup)</span>
              <span>{formatCurrency(DEPOSIT_AMOUNT)}</span>
            </div>
          </div>

          {/* Trip summary */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-400">Customer</span>
              <span className="text-white">
                {contactInfo.customer_type === 'private'
                  ? `${contactInfo.first_name} ${contactInfo.last_name}`
                  : contactInfo.company_name}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Pickup</span>
              <span className="text-white text-right">
                {state.pickupDate ? format(state.pickupDate, 'dd MMM yyyy') : ''} · {state.pickupTime}
                <br /><span className="text-xs text-zinc-500">{state.pickupLocation}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Dropoff</span>
              <span className="text-white text-right">
                {state.dropoffDate ? format(state.dropoffDate, 'dd MMM yyyy') : ''} · {state.dropoffTime}
                <br /><span className="text-xs text-zinc-500">{state.dropoffLocation}</span>
              </span>
            </div>
            {state.notes && (
              <div className="flex justify-between">
                <span className="text-zinc-400">Notes</span>
                <span className="text-zinc-300 text-right max-w-[60%]">{state.notes}</span>
              </div>
            )}
          </div>

          {/* Checkboxes */}
          <div className="space-y-2">
            {CHECKBOXES.map(cb => (
              <label
                key={cb.key}
                className={cn(
                  'flex gap-3 p-4 rounded-lg border cursor-pointer transition-all',
                  state.checkboxes[cb.key] ? 'border-gold/40 bg-gold/5' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
                )}
              >
                <Checkbox
                  checked={state.checkboxes[cb.key]}
                  onCheckedChange={v => setCheckbox(cb.key, !!v)}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <p className="text-sm font-semibold text-white">{cb.label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{cb.description}</p>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={prevStep} className="flex-1" size="lg" disabled={isPending}>
              <ChevronLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!allCheckboxesChecked || isPending}
              className="flex-1"
              size="lg"
            >
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Processing…</> : 'Confirm'}
            </Button>
          </div>

          {!allCheckboxesChecked && (
            <p className="text-xs text-zinc-500 text-center">Accept all 4 agreements to confirm.</p>
          )}
        </div>
      )}
    </div>
  )
}
