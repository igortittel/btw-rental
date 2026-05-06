import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import { ASSISTANCE_CONTACTS, type Booking } from '@/types'
import { PrintButton } from '@/components/PrintButton'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Booking Confirmation' }

interface Props { params: Promise<{ id: string }> }

export default async function PrintBookingPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('bookings')
    .select('*, vehicle:vehicles(*)')
    .eq('id', id)
    .single()

  if (error || !data) notFound()
  const booking = data as Booking
  const ci = booking.contact_info_json

  return (
    <>
      <style>{`
        nav, header { display: none !important; }
        main { padding-top: 0 !important; }
        @media print {
          body { background: white !important; color: black !important; }
          .no-print { display: none !important; }
          .page { max-width: 100% !important; }
        }
        @page { margin: 20mm; }
      `}</style>

      <PrintButton />

      <div className="page max-w-2xl mx-auto p-8 bg-white text-zinc-900 font-montserrat min-h-screen">

        {/* Header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-zinc-200">
          <div>
            <h1 className="text-3xl font-black tracking-wider text-zinc-900">BTW</h1>
            <p className="text-xs text-zinc-500 tracking-widest uppercase mt-0.5">By The Wave · Premium Car Rental</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500 uppercase tracking-wider">Booking Confirmation</p>
            <p className="text-xl font-black text-zinc-900 mt-1">{booking.booking_number}</p>
            <p className="text-xs text-zinc-400 mt-0.5">
              Issued {new Date(booking.created_at).toLocaleDateString('en-GB', { day:'2-digit', month:'long', year:'numeric' })}
            </p>
          </div>
        </div>

        {/* 2-col grid */}
        <div className="grid grid-cols-2 gap-6 mb-6">

          {/* Vehicle */}
          <div className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Vehicle</h2>
            <p className="font-bold text-zinc-900">{booking.vehicle?.name}</p>
            <p className="text-sm text-zinc-500">{booking.vehicle?.brand} · {booking.vehicle?.year}</p>
            <p className="text-sm text-zinc-500">Plate: <span className="font-mono font-bold">{booking.vehicle?.plate}</span></p>
            <p className="text-sm text-zinc-500">Engine: {booking.vehicle?.engine}</p>
          </div>

          {/* Customer */}
          <div className="space-y-1.5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Customer</h2>
            {ci?.customer_type === 'private' ? (
              <p className="font-bold text-zinc-900">{ci.first_name} {ci.last_name}</p>
            ) : (
              <>
                <p className="font-bold text-zinc-900">{ci?.company_name}</p>
                <p className="text-sm text-zinc-500">IČO: {ci?.ico}</p>
              </>
            )}
            <p className="text-sm text-zinc-500">{ci?.email}</p>
            <p className="text-sm text-zinc-500">{ci?.phone}</p>
          </div>
        </div>

        {/* Dates */}
        <div className="bg-zinc-50 rounded-lg p-4 mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-3">Rental Period</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-0.5">Pickup</p>
              <p className="font-bold text-zinc-900">{formatDateTime(booking.pickup_datetime)}</p>
              <p className="text-sm text-zinc-500">{booking.pickup_location}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-400 uppercase tracking-wider mb-0.5">Dropoff</p>
              <p className="font-bold text-zinc-900">{formatDateTime(booking.dropoff_datetime)}</p>
              <p className="text-sm text-zinc-500">{booking.dropoff_location}</p>
            </div>
          </div>
        </div>

        {/* Add-ons */}
        {booking.addon_services_json?.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Add-on Services</h2>
            <div className="space-y-1">
              {booking.addon_services_json.map(a => (
                <div key={a.id} className="flex justify-between text-sm">
                  <span className="text-zinc-700">{a.name_sk ?? a.name}</span>
                  <span className="font-semibold">+{formatCurrency(a.price)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {booking.notes && (
          <div className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Notes</h2>
            <p className="text-sm text-zinc-600">{booking.notes}</p>
          </div>
        )}

        {/* Price */}
        <div className="border-t-2 border-zinc-200 pt-4 mb-8">
          <div className="flex justify-between items-center">
            <span className="text-lg font-bold text-zinc-900">Total Amount</span>
            <span className="text-2xl font-black text-zinc-900">{formatCurrency(booking.total_price)}</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Security deposit €1,000 pre-authorised at pickup · Mileage limit 300 km/day (€0.62/km excess)
          </p>
        </div>

        {/* Contacts */}
        <div className="bg-zinc-50 rounded-lg p-4 text-sm text-zinc-600">
          <p className="font-bold text-zinc-900 mb-1">By The Wave — Contact</p>
          <p>📞 {ASSISTANCE_CONTACTS.emergency} · 💬 {ASSISTANCE_CONTACTS.whatsapp} · ✉️ {ASSISTANCE_CONTACTS.email}</p>
        </div>

      </div>
    </>
  )
}
