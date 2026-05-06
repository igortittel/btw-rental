'use client'

import { useEffect, useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, AlertTriangle } from 'lucide-react'
import { differenceInCalendarDays } from 'date-fns'
import { Button }          from '@/components/ui/button'
import { Input }           from '@/components/ui/input'
import { Label }           from '@/components/ui/label'
import { Checkbox }        from '@/components/ui/checkbox'
import { Textarea }        from '@/components/ui/textarea'
import { Badge }           from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator }       from '@/components/ui/separator'
import { DatePickerInput } from '@/components/ui/datepicker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient }    from '@/lib/supabase/client'
import { formatCurrency, generateTimeSlots, getPricePerDay } from '@/lib/utils'
import { ADDON_SERVICES, type Vehicle, type AddonService } from '@/types'

const TIME_SLOTS = generateTimeSlots(30)

export default function NewAdminBookingPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

  // Form state
  const [vehicleId,      setVehicleId]      = useState('')
  const [pickupDate,     setPickupDate]     = useState('')
  const [pickupTime,     setPickupTime]     = useState('09:00')
  const [dropoffDate,    setDropoffDate]    = useState('')
  const [dropoffTime,    setDropoffTime]    = useState('09:00')
  const [pickupLoc,      setPickupLoc]      = useState('')
  const [dropoffLoc,     setDropoffLoc]     = useState('')
  const [customerType,   setCustomerType]   = useState<'private'|'business'>('private')
  const [firstName,      setFirstName]      = useState('')
  const [lastName,       setLastName]       = useState('')
  const [companyName,    setCompanyName]    = useState('')
  const [ico,            setIco]            = useState('')
  const [email,          setEmail]          = useState('')
  const [phone,          setPhone]          = useState('')
  const [notes,          setNotes]          = useState('')
  const [addons,         setAddons]         = useState<AddonService[]>(ADDON_SERVICES.map(a => ({ ...a, selected: false })))

  useEffect(() => {
    createClient().from('vehicles').select('*').eq('is_available', true).order('brand')
      .then(({ data }) => setVehicles((data ?? []) as Vehicle[]))
  }, [])

  const selectedVehicle = useMemo(() => vehicles.find(v => v.id === vehicleId), [vehicles, vehicleId])

  const numberOfDays = useMemo(() => {
    if (!pickupDate || !dropoffDate) return 0
    return Math.max(differenceInCalendarDays(new Date(dropoffDate), new Date(pickupDate)), 1)
  }, [pickupDate, dropoffDate])

  const total = useMemo(() => {
    if (!selectedVehicle || numberOfDays === 0) return 0
    const base = getPricePerDay(selectedVehicle, numberOfDays) * numberOfDays
    const addonsTotal = addons.filter(a => a.selected).reduce((s, a) => s + a.price * numberOfDays, 0)
    return base + addonsTotal
  }, [selectedVehicle, numberOfDays, addons])

  const toggleAddon = (id: string) =>
    setAddons(prev => prev.map(a => a.id === id ? { ...a, selected: !a.selected } : a))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!vehicleId || !pickupDate || !dropoffDate || !email) {
      setError('Vehicle, dates and email are required.'); return
    }
    setError(null)

    const buildDt = (date: string, time: string) => {
      const [h, m] = time.split(':').map(Number)
      const dt = new Date(date + 'T00:00:00')
      dt.setHours(h, m, 0, 0)
      return dt.toISOString()
    }

    startTransition(async () => {
      const supabase = createClient()
      const { error: err } = await supabase.from('bookings').insert({
        vehicle_id:          vehicleId,
        user_id:             null,
        pickup_datetime:     buildDt(pickupDate, pickupTime),
        dropoff_datetime:    buildDt(dropoffDate, dropoffTime),
        status:              'confirmed',
        pickup_location:     pickupLoc,
        dropoff_location:    dropoffLoc,
        total_price:         total,
        notes:               notes || null,
        addon_services_json: addons.filter(a => a.selected),
        document_urls:       [],
        contact_info_json: {
          customer_type: customerType,
          first_name: firstName, last_name: lastName,
          company_name: companyName, ico,
          email, phone,
        },
      })
      if (err) { setError(err.message); return }
      router.push('/admin/bookings')
    })
  }

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-2xl">

        <Link href="/admin/bookings"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> All Bookings
        </Link>
        <div className="mb-6">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-1">Admin</Badge>
          <h1 className="text-2xl font-black font-montserrat text-white">New Booking</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Vehicle */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader><CardTitle className="text-sm">Vehicle</CardTitle></CardHeader>
            <CardContent>
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger><SelectValue placeholder="Select vehicle…" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name} — {formatCurrency(v.daily_price)}/day
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader><CardTitle className="text-sm">Rental Period</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Pickup Date</Label>
                  <DatePickerInput value={pickupDate} onChange={setPickupDate} minDate={new Date()} />
                </div>
                <div className="space-y-1.5">
                  <Label>Pickup Time</Label>
                  <Select value={pickupTime} onValueChange={setPickupTime}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Dropoff Date</Label>
                  <DatePickerInput value={dropoffDate} onChange={setDropoffDate} minDate={new Date()} />
                </div>
                <div className="space-y-1.5">
                  <Label>Dropoff Time</Label>
                  <Select value={dropoffTime} onValueChange={setDropoffTime}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TIME_SLOTS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Pickup Location</Label>
                  <Input value={pickupLoc} onChange={e => setPickupLoc(e.target.value)} placeholder="e.g. Bratislava Airport" />
                </div>
                <div className="space-y-1.5">
                  <Label>Dropoff Location</Label>
                  <Input value={dropoffLoc} onChange={e => setDropoffLoc(e.target.value)} placeholder="e.g. Vienna Airport" />
                </div>
              </div>
              {numberOfDays > 0 && selectedVehicle && (
                <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-sm flex justify-between">
                  <span className="text-zinc-400">{numberOfDays} day{numberOfDays !== 1 ? 's' : ''} × {formatCurrency(getPricePerDay(selectedVehicle, numberOfDays))}/day</span>
                  <span className="font-bold text-gold">{formatCurrency(total)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Customer */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-1 bg-zinc-950 rounded-lg p-1 w-fit">
                {(['private','business'] as const).map(t => (
                  <button key={t} type="button" onClick={() => setCustomerType(t)}
                    className={`px-4 py-1.5 rounded-md text-sm font-semibold capitalize transition-colors ${customerType === t ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label>First Name</Label><Input value={firstName} onChange={e => setFirstName(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Last Name</Label><Input value={lastName} onChange={e => setLastName(e.target.value)} /></div>
                {customerType === 'business' && <>
                  <div className="space-y-1.5"><Label>Company</Label><Input value={companyName} onChange={e => setCompanyName(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label>IČO</Label><Input value={ico} onChange={e => setIco(e.target.value)} /></div>
                </>}
                <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
                <div className="space-y-1.5"><Label>Phone</Label><Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Internal notes…" />
              </div>
            </CardContent>
          </Card>

          {/* Add-ons */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader><CardTitle className="text-sm">Add-ons</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {addons.map(a => (
                <label key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors">
                  <div className="flex items-center gap-3">
                    <Checkbox checked={a.selected} onCheckedChange={() => toggleAddon(a.id)} />
                    <span className="text-sm text-white">{a.name_sk}</span>
                  </div>
                  <span className="text-sm text-zinc-400">{formatCurrency(a.price)}/day</span>
                </label>
              ))}
            </CardContent>
          </Card>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <AlertTriangle className="h-4 w-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isPending}>
              {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</> : `Create Booking (${formatCurrency(total)})`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
