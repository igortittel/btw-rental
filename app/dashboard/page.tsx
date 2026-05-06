import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Calendar, Car, CheckCircle2, Plus, Phone, Mail,
  MessageCircle, Clock, ChevronRight, MapPin,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import CountdownTimer from '@/components/CountdownTimer'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatDateTime, getStatusColor } from '@/lib/utils'
import { ASSISTANCE_CONTACTS, type Booking, type Profile } from '@/types'

export const metadata = { title: 'My Dashboard' }

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: bookingsRaw }, { data: profileRaw }] = await Promise.all([
    supabase
      .from('bookings')
      .select('*, vehicle:vehicles(name, plate, image_urls)')
      .eq('user_id', user.id)
      .order('pickup_datetime', { ascending: false }),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const bookings = (bookingsRaw ?? []) as Booking[]
  const profile  = profileRaw as Profile | null
  const now      = new Date()

  const upcoming = bookings
    .filter(b => new Date(b.pickup_datetime) > now && b.status !== 'cancelled')
    .sort((a, b) => +new Date(a.pickup_datetime) - +new Date(b.pickup_datetime))

  const past = bookings.filter(
    b => new Date(b.dropoff_datetime) <= now || b.status === 'completed' || b.status === 'cancelled'
  )

  const nextTrip = upcoming[0] ?? null

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(184,135,70,0.04)_0%,transparent_50%)] pointer-events-none" />
      <div className="container mx-auto px-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-1">Dashboard</p>
            <h1 className="text-3xl font-black font-montserrat text-white">
              Welcome{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
            </h1>
            <p className="text-zinc-400 text-sm mt-1">{user.email}</p>
          </div>
          <Button asChild>
            <Link href="/fleet"><Plus className="h-4 w-4" /> New Booking</Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">

          {/* ── Main column ── */}
          <div className="space-y-6">

            {/* Countdown + Show Booking */}
            {nextTrip ? (
              <div className="space-y-3">
                <CountdownTimer booking={nextTrip} />
                <Card className="border-zinc-800 bg-zinc-900/60">
                  <CardContent className="p-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Vehicle</span>
                      <span className="font-semibold text-white">{nextTrip.vehicle?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Pickup</span>
                      <span className="text-zinc-300 text-right">
                        {formatDateTime(nextTrip.pickup_datetime)}
                        <br /><span className="text-xs text-zinc-500">{nextTrip.pickup_location}</span>
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Dropoff</span>
                      <span className="text-zinc-300 text-right">
                        {formatDateTime(nextTrip.dropoff_datetime)}
                        <br /><span className="text-xs text-zinc-500">{nextTrip.dropoff_location}</span>
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between items-center">
                      <span className="text-zinc-400">Total</span>
                      <span className="font-black font-montserrat text-gold text-lg">
                        {formatCurrency(nextTrip.total_price)}
                      </span>
                    </div>
                    <Button asChild className="w-full mt-1">
                      <Link href={`/dashboard/bookings/${nextTrip.id}`}>
                        Show Booking <ChevronRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card className="border-zinc-800 bg-zinc-900/40">
                <CardContent className="py-8 text-center">
                  <Calendar className="h-8 w-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-zinc-500 text-sm">No upcoming trips scheduled.</p>
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href="/fleet">Book Now</Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Upcoming reservations */}
            <div>
              <h2 className="text-lg font-bold font-montserrat text-white mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gold" /> Upcoming Reservations
              </h2>
              {upcoming.length === 0 ? (
                <Card className="border-zinc-800 bg-zinc-900/40">
                  <CardContent className="py-10 text-center">
                    <Car className="h-10 w-10 text-zinc-700 mx-auto mb-3" />
                    <p className="text-zinc-400 text-sm">No upcoming bookings.</p>
                    <Button asChild className="mt-4" size="sm">
                      <Link href="/fleet">Explore Fleet</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {upcoming.map(b => <BookingRow key={b.id} booking={b} />)}
                </div>
              )}
            </div>

            {/* Past reservations */}
            {past.length > 0 && (
              <div>
                <h2 className="text-lg font-bold font-montserrat text-white mb-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-zinc-500" /> Past Reservations
                </h2>
                <div className="space-y-3">
                  {past.map(b => <BookingRow key={b.id} booking={b} />)}
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar: Contacts only ── */}
          <div>
            <Card className="border-zinc-800 bg-zinc-900/60 sticky top-24">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gold" /> Assistance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <a href={`tel:${ASSISTANCE_CONTACTS.emergency}`}
                  className="flex items-center gap-3 text-zinc-300 hover:text-gold transition-colors">
                  <Phone className="h-4 w-4 text-gold/60 shrink-0" />
                  <div>
                    <p className="font-semibold">{ASSISTANCE_CONTACTS.emergency}</p>
                    <p className="text-xs text-zinc-500">Emergency · {ASSISTANCE_CONTACTS.hours}</p>
                  </div>
                </a>
                <Separator />
                <a href={`https://wa.me/${ASSISTANCE_CONTACTS.whatsapp.replace(/\D/g, '')}`}
                  className="flex items-center gap-3 text-zinc-300 hover:text-gold transition-colors">
                  <MessageCircle className="h-4 w-4 text-gold/60 shrink-0" />
                  <div>
                    <p className="font-semibold">{ASSISTANCE_CONTACTS.whatsapp}</p>
                    <p className="text-xs text-zinc-500">WhatsApp</p>
                  </div>
                </a>
                <Separator />
                <a href={`mailto:${ASSISTANCE_CONTACTS.email}`}
                  className="flex items-center gap-3 text-zinc-300 hover:text-gold transition-colors">
                  <Mail className="h-4 w-4 text-gold/60 shrink-0" />
                  <div>
                    <p className="font-semibold">{ASSISTANCE_CONTACTS.email}</p>
                    <p className="text-xs text-zinc-500">Email support</p>
                  </div>
                </a>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  )
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/50 hover:border-zinc-600 transition-all">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[10px] font-mono text-zinc-500">{booking.booking_number}</span>
              <Badge className={`text-[10px] ${getStatusColor(booking.status)}`}>{booking.status}</Badge>
            </div>
            <h3 className="font-bold font-montserrat text-white truncate">
              {booking.vehicle?.name ?? 'Vehicle'}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 mt-1">
              <Calendar className="h-3.5 w-3.5 text-gold/50 shrink-0" />
              <span>{formatDateTime(booking.pickup_datetime)}</span>
              <span className="text-zinc-600">→</span>
              <span>{formatDateTime(booking.dropoff_datetime)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-0.5">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{booking.pickup_location}</span>
            </div>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-2">
            <p className="font-black font-montserrat text-gold text-lg">
              {formatCurrency(booking.total_price)}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/bookings/${booking.id}`}>
                View Detail <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
