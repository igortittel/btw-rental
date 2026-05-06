'use client'

import { useEffect, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Car, Users, Package,
  Upload, AlertTriangle, Loader2, Check, Trash2,
} from 'lucide-react'
import { Button }    from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge }     from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Input }     from '@/components/ui/input'
import { Label }     from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDateTime, getStatusLabel, cn } from '@/lib/utils'
import { STATUS_LABELS, type Booking, type BookingStatus } from '@/types'

const STATUS_COLORS: Record<string, string> = {
  pending:   'border-yellow-500/40 bg-yellow-500/10 text-yellow-400',
  confirmed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400',
  active:    'border-blue-500/40 bg-blue-500/10 text-blue-400',
  completed: 'border-zinc-600 bg-zinc-800/60 text-zinc-400',
  cancelled: 'border-red-500/40 bg-red-500/10 text-red-400',
}

// Admin can always change to any status
const ALL_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['active', 'cancelled'],
  active:    ['completed', 'cancelled'],
  completed: ['active'],
  cancelled: ['pending', 'confirmed'],
}

export default function AdminBookingDetailPage() {
  const { number } = useParams<{ number: string }>()
  const router = useRouter()

  const [booking, setBooking]         = useState<Booking | null>(null)
  const [loading, setLoading]         = useState(true)
  const [isPending, startTransition]  = useTransition()
  const [statusError, setStatusError] = useState<string | null>(null)
  const [kmValue, setKmValue]         = useState('')
  const [kmSaved, setKmSaved]         = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  async function load() {
    const supabase = createClient()
    const { data } = await supabase
      .from('bookings')
      .select('*, vehicle:vehicles(*)')
      .eq('booking_number', number)
      .single()
    setBooking(data as Booking)
    setKmValue(data?.km_driven != null ? String(data.km_driven) : '')
  }

  useEffect(() => { load().then(() => setLoading(false)) }, [number])

  const handleStatusChange = (newStatus: string) => {
    setStatusError(null)
    startTransition(async () => {
      const fd = new FormData(); fd.set('status', newStatus)
      const res = await fetch(`/api/admin/bookings/${booking!.id}/status`, { method: 'POST', body: fd })
      if (!res.ok) { setStatusError('Failed to update status'); return }
      await load()
    })
  }

  const handleKmSave = async () => {
    const km = parseInt(kmValue)
    if (isNaN(km) || !booking) return
    await createClient().from('bookings').update({ km_driven: km }).eq('id', booking.id)
    setKmSaved(true)
    setTimeout(() => setKmSaved(false), 2000)
    await load()
  }

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !booking) return
    const supabase = createClient()
    const path = `${booking.id}/${Date.now()}_${file.name}`
    const { error } = await supabase.storage.from('booking-documents').upload(path, file)
    if (!error) {
      const existing = booking.document_urls ?? []
      await supabase.from('bookings').update({ document_urls: [...existing, path] }).eq('id', booking.id)
      await load()
    }
  }

  const handleDelete = () => {
    startTransition(async () => {
      await createClient().from('bookings').delete().eq('id', booking!.id)
      router.push('/admin/bookings')
    })
  }

  if (loading) return (
    <div className="min-h-screen pt-24 flex items-center justify-center">
      <div className="h-8 w-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!booking) return (
    <div className="min-h-screen pt-24 text-center py-20">
      <p className="text-zinc-400">Booking not found.</p>
      <Button asChild className="mt-4" variant="outline"><Link href="/admin/bookings">Back</Link></Button>
    </div>
  )

  const ci = booking.contact_info_json
  const availableTransitions = ALL_TRANSITIONS[booking.status] ?? []

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">

        <Link href="/admin/bookings"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> All Bookings
        </Link>

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
          <div>
            <p className="text-xs font-mono text-zinc-500 mb-1">{booking.booking_number}</p>
            <h1 className="text-2xl font-black font-montserrat text-white">
              {booking.vehicle?.name ?? 'Booking Detail'}
            </h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              {ci?.customer_type === 'private'
                ? `${ci.first_name} ${ci.last_name}`
                : ci?.company_name}
              {ci?.email && ` · ${ci.email}`}
            </p>
          </div>

          {/* Status + transitions */}
          <div className="shrink-0 space-y-2">
            <div className={cn(
              'inline-flex items-center gap-2 px-4 py-2 rounded-xl border font-semibold font-montserrat text-sm',
              STATUS_COLORS[booking.status]
            )}>
              <span className="h-2 w-2 rounded-full bg-current" />
              {STATUS_LABELS[booking.status]}
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Change status</p>
              <div className="flex gap-2 flex-wrap">
                {availableTransitions.map(next => (
                  <button
                    key={next}
                    onClick={() => handleStatusChange(next)}
                    disabled={isPending}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-lg font-semibold border transition-colors disabled:opacity-40',
                      next === 'cancelled'
                        ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                        : next === 'confirmed'
                        ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                        : next === 'active'
                        ? 'border-blue-500/30 text-blue-400 hover:bg-blue-500/10'
                        : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    )}
                  >
                    {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : STATUS_LABELS[next]}
                  </button>
                ))}
              </div>
              {statusError && <p className="text-xs text-red-400">{statusError}</p>}
            </div>
          </div>
        </div>

        <div className="space-y-4">

          {/* Vehicle */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 uppercase tracking-wider font-medium">
                <Car className="h-4 w-4 text-gold" /> Vehicle
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Vehicle">{booking.vehicle?.name}</Row>
              <Row label="Plate"><span className="font-mono">{booking.vehicle?.plate}</span></Row>
              <Row label="VIN"><span className="font-mono text-xs">{booking.vehicle?.vin}</span></Row>
              <Separator />
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs">Kilometres Driven</Label>
                  <Input
                    type="number"
                    value={kmValue}
                    onChange={e => setKmValue(e.target.value)}
                    placeholder="e.g. 520"
                    className="h-8 text-sm"
                  />
                </div>
                <Button size="sm" onClick={handleKmSave} variant={kmSaved ? 'default' : 'outline'}>
                  {kmSaved ? <><Check className="h-3.5 w-3.5" /> Saved</> : 'Save km'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 uppercase tracking-wider font-medium">
                <Calendar className="h-4 w-4 text-gold" /> Dates & Locations
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Pickup">
                <div className="text-right">
                  <p>{formatDateTime(booking.pickup_datetime)}</p>
                  <p className="text-xs text-zinc-500">{booking.pickup_location}</p>
                </div>
              </Row>
              <Row label="Dropoff">
                <div className="text-right">
                  <p>{formatDateTime(booking.dropoff_datetime)}</p>
                  <p className="text-xs text-zinc-500">{booking.dropoff_location}</p>
                </div>
              </Row>
              {booking.notes && <Row label="Notes"><span className="text-right max-w-[60%]">{booking.notes}</span></Row>}
            </CardContent>
          </Card>

          {/* Customer */}
          {ci && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 uppercase tracking-wider font-medium">
                  <Users className="h-4 w-4 text-gold" /> Customer
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Name">
                  {ci.customer_type === 'private'
                    ? `${ci.first_name} ${ci.last_name}`
                    : ci.company_name}
                </Row>
                {ci.customer_type === 'business' && ci.ico && <Row label="IČO">{ci.ico}</Row>}
                <Row label="Email">{ci.email}</Row>
                <Row label="Phone">{ci.phone}</Row>
                <Row label="Type"><Badge variant="secondary" className="text-[10px] capitalize">{ci.customer_type}</Badge></Row>
              </CardContent>
            </Card>
          )}

          {/* Add-ons */}
          {booking.addon_services_json?.length > 0 && (
            <Card className="border-zinc-800 bg-zinc-900/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-zinc-300 uppercase tracking-wider font-medium">
                  <Package className="h-4 w-4 text-gold" /> Add-ons
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
              <Row label="Total Price">
                <span className="text-2xl font-black font-montserrat text-gold">
                  {formatCurrency(booking.total_price)}
                </span>
              </Row>
              {booking.cancellation_fee > 0 && (
                <Row label="Cancellation Fee">
                  <span className="text-red-400 font-semibold">{formatCurrency(booking.cancellation_fee)}</span>
                </Row>
              )}
              <Separator />
              <Row label="Booking #"><span className="font-mono text-xs text-zinc-400">{booking.booking_number}</span></Row>
              <Row label="Created">{new Date(booking.created_at).toLocaleDateString()}</Row>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-zinc-300">Documents</p>
                <label className="cursor-pointer flex items-center gap-1.5 text-xs text-gold hover:text-gold/80 transition-colors border border-gold/30 rounded-lg px-3 py-1.5">
                  <Upload className="h-3.5 w-3.5" /> Upload
                  <input type="file" className="hidden" onChange={handleDocUpload} accept=".pdf,.jpg,.png,.jpeg" />
                </label>
              </div>
              {booking.document_urls?.length > 0 ? (
                <ul className="space-y-1">
                  {booking.document_urls.map((doc, i) => (
                    <li key={i} className="text-xs text-zinc-400 truncate">{doc.split('/').pop()}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-600">No documents uploaded yet.</p>
              )}
            </CardContent>
          </Card>

          {/* ── Delete booking ── */}
          <Card className="border-red-500/20 bg-red-950/10">
            <CardContent className="p-4">
              {!showDeleteConfirm ? (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">Delete Booking</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Permanently remove this booking record.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 shrink-0"
                  >
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Are you sure? This cannot be undone.
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} disabled={isPending}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDelete}
                      disabled={isPending}
                      className="bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30"
                    >
                      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Delete'}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-zinc-400 shrink-0">{label}</span>
      <span className="text-white text-right">{children}</span>
    </div>
  )
}
