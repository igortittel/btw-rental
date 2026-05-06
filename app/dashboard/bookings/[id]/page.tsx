'use client'

import { useEffect, useState, useTransition, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import {
  ArrowLeft, Calendar, MapPin, Car, Users, Printer, Pencil,
  XCircle, AlertTriangle, CheckCircle2, Clock, Package,
  ChevronRight, Loader2, X, Check,
} from 'lucide-react'
import { format, parseISO, differenceInCalendarDays } from 'date-fns'
import { Button }    from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { Checkbox }  from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import {
  formatCurrency, formatDateTime, getStatusColor,
  getCancellationFee, getCancellationFeePct, canCancelFree,
  generateTimeSlots, getPricePerDay, cn,
} from '@/lib/utils'
import {
  CANCELLATION_POLICY, ADDON_SERVICES, DEFAULT_CONTACT_INFO,
  type Booking, type AddonService, type ContactInfo,
} from '@/types'

interface EditState {
  pickupDate:      Date
  dropoffDate:     Date
  pickupTime:      string
  dropoffTime:     string
  pickupLocation:  string
  dropoffLocation: string
  contactInfo:     ContactInfo
  addonServices:   AddonService[]
}

const TIME_SLOTS = generateTimeSlots(30)

function initEdit(b: Booking): EditState {
  const pd = parseISO(b.pickup_datetime)
  const dd = parseISO(b.dropoff_datetime)
  return {
    pickupDate:      pd,
    dropoffDate:     dd,
    pickupTime:      format(pd, 'HH:mm'),
    dropoffTime:     format(dd, 'HH:mm'),
    pickupLocation:  b.pickup_location,
    dropoffLocation: b.dropoff_location,
    contactInfo:     b.contact_info_json ?? { ...DEFAULT_CONTACT_INFO },
    addonServices:   ADDON_SERVICES.map(a => ({
      ...a,
      selected: (b.addon_services_json ?? []).some(ba => ba.id === a.id),
    })),
  }
}

function buildDt(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  const dt = new Date(date)
  dt.setHours(h, m, 0, 0)
  return dt
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [booking, setBooking]         = useState<Booking | null>(null)
  const [loading, setLoading]         = useState(true)
  const [isEditing, setIsEditing]     = useState(false)
  const [editState, setEditState]     = useState<EditState | null>(null)
  const [saveError, setSaveError]     = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [showCancel, setShowCancel]   = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function reload() {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings').select('*, vehicle:vehicles(*)').eq('id', id).single()
    setBooking(data as Booking)
  }

  useEffect(() => {
    reload().then(() => setLoading(false))
  }, [id])

  const editDays = useMemo(() => {
    if (!editState) return 0
    return Math.max(differenceInCalendarDays(editState.dropoffDate, editState.pickupDate), 1)
  }, [editState])

  const editTotal = useMemo(() => {
    if (!editState || !booking?.vehicle) return 0
    const ppd = getPricePerDay(booking.vehicle, editDays)
    const base = ppd * editDays
    const addons = editState.addonServices.filter(a => a.selected).reduce((s, a) => s + a.price * editDays, 0)
    return base + addons
  }, [editState, booking, editDays])

  const startEdit = () => {
    if (!booking) return
    setEditState(initEdit(booking))
    setIsEditing(true)
    setSaveError(null)
  }

  const discardEdit = () => { setIsEditing(false); setEditState(null); setSaveError(null) }

  const handleSave = () => {
    if (!editState || !booking) return
    setSaveError(null)
    startTransition(async () => {
      const pickupDt  = buildDt(editState.pickupDate, editState.pickupTime)
      const dropoffDt = buildDt(editState.dropoffDate, editState.dropoffTime)
      const supabase  = createClient()
      const { error } = await supabase.from('bookings').update({
        pickup_datetime:     pickupDt.toISOString(),
        dropoff_datetime:    dropoffDt.toISOString(),
        pickup_location:     editState.pickupLocation,
        dropoff_location:    editState.dropoffLocation,
        contact_info_json:   editState.contactInfo,
        addon_services_json: editState.addonServices.filter(a => a.selected),
        total_price:         editTotal,
        updated_at:          new Date().toISOString(),
      }).eq('id', id)
      if (error) { setSaveError(error.message); return }
      await reload()
      setIsEditing(false)
      setEditState(null)
    })
  }

  const handleCancel = () => {
    setCancelError(null)
    startTransition(async () => {
      const res  = await fetch(`/api/bookings/${id}/cancel`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setCancelError(json.error); return }
      setShowCancel(false)
      await reload()
    })
  }

  const setEdit = <K extends keyof EditState>(key: K, val: EditState[K]) =>
    setEditState(p => p ? { ...p, [key]: val } : p)

  const setContactEdit = <K extends keyof ContactInfo>(key: K, val: ContactInfo[K]) =>
    setEditState(p => p ? { ...p, contactInfo: { ...p.contactInfo, [key]: val } } : p)

  const toggleAddonEdit = (addonId: string) =>
    setEditState(p => p ? {
      ...p,
      addonServices: p.addonServices.map(a => a.id === addonId ? { ...a, selected: !a.selected } : a),
    } : p)

  if (loading) return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!booking) return (
    <div className="min-h-screen pt-24 text-center py-20">
      <p className="text-zinc-400">Booking not found.</p>
      <Button asChild className="mt-4" variant="outline"><Link href="/dashboard">Back</Link></Button>
    </div>
  )

  const canEdit   = booking.status === 'pending' || booking.status === 'confirmed'
  const canCancel = canEdit
  const feePct    = getCancellationFeePct(booking.pickup_datetime)
  const cancelFee = getCancellationFee(booking.total_price, booking.pickup_datetime)
  const isFree    = canCancelFree(booking.pickup_datetime)
  const ci        = booking.contact_info_json

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">

        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-xs font-mono text-zinc-500 mb-1">{booking.booking_number}</p>
            <h1 className="text-2xl font-black font-montserrat text-white">
              {booking.vehicle?.name ?? 'Booking Detail'}
            </h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={`text-sm px-3 py-1 ${getStatusColor(booking.status)}`}>
              {booking.status}
            </Badge>
            {canEdit && !isEditing && (
              <Button variant="outline" size="sm" onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Edit
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/bookings/${booking.id}/print`} target="_blank">
                <Printer className="h-4 w-4" /> PDF
              </Link>
            </Button>
          </div>
        </div>

        {/* ── EDIT MODE ── */}
        {isEditing && editState && (
          <div className="space-y-4 mb-4">
            <div className="rounded-xl border border-gold/30 bg-gold/5 p-5 space-y-5">
              <h2 className="font-bold font-montserrat text-white flex items-center gap-2">
                <Pencil className="h-4 w-4 text-gold" /> Edit Booking
              </h2>

              {/* Dates */}
              <div>
                <Label className="mb-2 block">Rental Dates</Label>
                <div className="flex justify-center">
                  <DayPicker
                    mode="range"
                    selected={{ from: editState.pickupDate, to: editState.dropoffDate }}
                    onSelect={r => {
                      if (r?.from) setEdit('pickupDate', r.from)
                      if (r?.to)   setEdit('dropoffDate', r.to)
                    }}
                    disabled={[{ before: new Date() }]}
                    classNames={{
                      day_selected: '!bg-gold !text-rich-black font-bold',
                      day_range_middle: '!bg-gold/20 !text-gold',
                      day_range_start: '!bg-gold !text-rich-black font-bold rounded-l-full',
                      day_range_end: '!bg-gold !text-rich-black font-bold rounded-r-full',
                      day_today: 'border border-gold/40',
                      nav_button: 'text-gold hover:bg-gold/10 rounded-md',
                      caption: 'text-white font-montserrat font-semibold',
                    }}
                    styles={{ root: { color: '#d4d4d4' } }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div className="space-y-1.5">
                    <Label>Pickup Time</Label>
                    <Select value={editState.pickupTime} onValueChange={v => setEdit('pickupTime', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dropoff Time</Label>
                    <Select value={editState.dropoffTime} onValueChange={v => setEdit('dropoffTime', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2 text-sm text-zinc-400 flex justify-between">
                  <span>Duration: <strong className="text-white">{editDays} day{editDays !== 1 ? 's' : ''}</strong></span>
                  <span>New total: <strong className="text-gold">{formatCurrency(editTotal)}</strong></span>
                </div>
              </div>

              <Separator />

              {/* Locations */}
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1.5">
                  <Label>Pickup Location</Label>
                  <Input
                    value={editState.pickupLocation}
                    onChange={e => setEdit('pickupLocation', e.target.value)}
                    placeholder="e.g. Bratislava Airport…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Dropoff Location</Label>
                  <Input
                    value={editState.dropoffLocation}
                    onChange={e => setEdit('dropoffLocation', e.target.value)}
                    placeholder="e.g. Vienna Airport…"
                  />
                </div>
              </div>

              <Separator />

              {/* Contact info */}
              <div className="space-y-3">
                <Label className="block">Contact Information</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>First Name</Label>
                    <Input
                      value={editState.contactInfo.first_name}
                      onChange={e => setContactEdit('first_name', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Last Name</Label>
                    <Input
                      value={editState.contactInfo.last_name}
                      onChange={e => setContactEdit('last_name', e.target.value)}
                    />
                  </div>
                </div>
                {editState.contactInfo.customer_type === 'business' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Company</Label>
                      <Input
                        value={editState.contactInfo.company_name}
                        onChange={e => setContactEdit('company_name', e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>IČO / VAT</Label>
                      <Input
                        value={editState.contactInfo.ico}
                        onChange={e => setContactEdit('ico', e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={editState.contactInfo.email}
                      onChange={e => setContactEdit('email', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      type="tel"
                      value={editState.contactInfo.phone}
                      onChange={e => setContactEdit('phone', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Add-ons */}
              <div className="space-y-2">
                <Label className="block">Add-on Services</Label>
                {editState.addonServices.map(a => (
                  <label
                    key={a.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-all',
                      a.selected ? 'border-gold/50 bg-gold/5' : 'border-zinc-800 hover:border-zinc-700'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox checked={a.selected} onCheckedChange={() => toggleAddonEdit(a.id)} />
                      <span className="text-sm text-white">{a.name_sk}</span>
                    </div>
                    <span className={cn('text-sm font-semibold', a.selected ? 'text-gold' : 'text-zinc-500')}>
                      {formatCurrency(a.price)}/day
                    </span>
                  </label>
                ))}
              </div>

              {saveError && (
                <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                  <AlertTriangle className="h-4 w-4 shrink-0" />{saveError}
                </div>
              )}

              {/* Edit actions */}
              <div className="flex gap-3 pt-1">
                <Button variant="outline" onClick={discardEdit} disabled={isPending} className="flex-1">
                  <X className="h-4 w-4" /> Discard
                </Button>
                <Button onClick={handleSave} disabled={isPending} className="flex-1">
                  {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Check className="h-4 w-4" /> Save Changes</>}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── VIEW MODE ── */}
        {!isEditing && (
          <div className="space-y-4">

            {/* Vehicle */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 font-medium uppercase tracking-wider">
                  <Car className="h-4 w-4 text-gold" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Vehicle</span>
                  <span className="font-bold text-white">{booking.vehicle?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Plate</span>
                  <span className="font-mono text-zinc-300">{booking.vehicle?.plate}</span>
                </div>
                {booking.km_driven != null && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Kilometres driven</span>
                    <span className="text-zinc-300">{booking.km_driven.toLocaleString()} km</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dates & Locations */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 font-medium uppercase tracking-wider">
                  <Calendar className="h-4 w-4 text-gold" /> Dates & Locations
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Pickup</span>
                  <span className="text-white text-right">
                    {formatDateTime(booking.pickup_datetime)}
                    <br /><span className="text-xs text-zinc-500">{booking.pickup_location}</span>
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Dropoff</span>
                  <span className="text-white text-right">
                    {formatDateTime(booking.dropoff_datetime)}
                    <br /><span className="text-xs text-zinc-500">{booking.dropoff_location}</span>
                  </span>
                </div>
                {booking.notes && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Notes</span>
                    <span className="text-zinc-300 text-right max-w-[60%]">{booking.notes}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Customer */}
            {ci && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 font-medium uppercase tracking-wider">
                    <Users className="h-4 w-4 text-gold" /> Customer Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Name</span>
                    <span className="text-white">
                      {ci.customer_type === 'private'
                        ? `${ci.first_name} ${ci.last_name}`
                        : ci.company_name}
                    </span>
                  </div>
                  {ci.customer_type === 'business' && ci.ico && (
                    <div className="flex justify-between">
                      <span className="text-zinc-400">IČO</span>
                      <span className="text-zinc-300">{ci.ico}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Email</span>
                    <span className="text-zinc-300">{ci.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Phone</span>
                    <span className="text-zinc-300">{ci.phone}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Add-ons */}
            {booking.addon_services_json?.length > 0 && (
              <Card className="border-zinc-800 bg-zinc-900/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 font-medium uppercase tracking-wider">
                    <Package className="h-4 w-4 text-gold" /> Add-on Services
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {booking.addon_services_json.map(a => (
                    <div key={a.id} className="flex justify-between text-sm">
                      <span className="text-zinc-300">{a.name_sk ?? a.name}</span>
                      <span className="text-gold font-semibold">{formatCurrency(a.price)}/day</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Price */}
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardContent className="p-4 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">Total Price</span>
                  <span className="text-2xl font-black font-montserrat text-gold">
                    {formatCurrency(booking.total_price)}
                  </span>
                </div>
                {booking.cancellation_fee > 0 && (
                  <div className="flex justify-between text-red-400">
                    <span>Cancellation Fee</span>
                    <span className="font-semibold">{formatCurrency(booking.cancellation_fee)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between text-xs text-zinc-600">
                  <span>Security deposit (pre-authorised at pickup)</span>
                  <span>{formatCurrency(1000)}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── CANCEL RESERVATION (always at bottom) ── */}
        {canCancel && (
          <div className="mt-4">
            <Card className={`border ${isFree ? 'border-zinc-800' : 'border-red-500/20 bg-red-950/10'}`}>
              <CardContent className="p-4">
                {!showCancel ? (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">Cancel Reservation</p>
                      <p className="text-xs text-zinc-400 mt-0.5">
                        {isFree
                          ? 'Free cancellation — more than 7 days before pickup.'
                          : `Cancellation fee: ${formatCurrency(cancelFee)} (${feePct}%)`}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCancel(true)}
                      className="border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0"
                    >
                      <XCircle className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        {isFree
                          ? 'Are you sure? This cannot be undone.'
                          : `A cancellation fee of ${formatCurrency(cancelFee)} (${feePct}%) will be charged. Are you sure?`}
                      </span>
                    </div>
                    {cancelError && <p className="text-sm text-red-400">{cancelError}</p>}
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowCancel(false)} disabled={isPending}>
                        Keep Booking
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleCancel}
                        disabled={isPending}
                        className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                      >
                        {isPending ? 'Cancelling…' : 'Confirm Cancellation'}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-zinc-800 space-y-1">
                  {CANCELLATION_POLICY.map(p => (
                    <div key={p.fee_pct} className="flex items-center gap-2 text-xs text-zinc-500">
                      {p.fee_pct === 0
                        ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                        : <Clock className="h-3 w-3 text-zinc-600 shrink-0" />}
                      {p.label}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
