import { notFound } from 'next/navigation'
import { Fuel, Gauge, Calendar, Users, Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import BookingWizard from '@/components/BookingWizard'
import ImageGallery from '@/components/ImageGallery'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, getMinPricePerDay } from '@/lib/utils'
import { CATEGORY_LABELS, type Vehicle } from '@/types'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const supabase = await createClient()
  const { data } = await supabase.from('vehicles').select('name, brand').eq('id', id).single()
  return { title: data ? `${data.name} — ${data.brand}` : 'Vehicle Detail' }
}

export default async function VehicleDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).single()
  if (error || !data) notFound()
  const vehicle = data as Vehicle

  const minPrice    = getMinPricePerDay(vehicle)
  const hasDiscount = vehicle.price_tiers_json?.length > 1

  const specs = [
    { label: 'Year',         value: String(vehicle.year),          icon: <Calendar className="h-3.5 w-3.5" /> },
    { label: 'Category',     value: CATEGORY_LABELS[vehicle.category], icon: <Star className="h-3.5 w-3.5" /> },
    { label: 'Fuel',         value: vehicle.fuel.charAt(0).toUpperCase() + vehicle.fuel.slice(1), icon: <Fuel className="h-3.5 w-3.5" /> },
    { label: 'Transmission', value: vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1), icon: <Gauge className="h-3.5 w-3.5" /> },
    { label: 'Engine',       value: vehicle.engine,                icon: null },
    { label: 'Seats',        value: `${vehicle.seats_count} seats`, icon: <Users className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="container mx-auto px-4">
        {/* Breadcrumb */}
        <div className="py-4 text-sm text-zinc-500">
          <a href="/fleet" className="hover:text-gold transition-colors">Fleet</a>
          <span className="mx-2">/</span>
          <span className="text-zinc-300">{vehicle.name}</span>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-10">

          {/* ── Left column ── */}
          <div>
            <ImageGallery images={vehicle.image_urls} vehicleName={vehicle.name} />

            {/* Brand / Name / Price */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-gold/80 uppercase tracking-widest">{vehicle.brand}</p>
                <Badge variant="outline" className="text-[10px] border-gold/30 text-gold/70">
                  {CATEGORY_LABELS[vehicle.category]}
                </Badge>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <h1 className="text-3xl sm:text-4xl font-black font-montserrat text-white">{vehicle.name}</h1>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 mb-0.5">{hasDiscount ? 'From' : ''}</p>
                  <p>
                    <span className="text-3xl font-black font-montserrat text-gold">
                      {formatCurrency(minPrice)}
                    </span>
                    <span className="text-zinc-400 text-sm"> /day</span>
                  </p>
                  {hasDiscount && (
                    <p className="text-xs text-emerald-400 mt-0.5">Lower rates for longer rentals</p>
                  )}
                </div>
              </div>
            </div>

            {/* Price tiers */}
            {hasDiscount && (
              <div className="mb-6 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-3">Price Tiers</p>
                <div className="grid grid-cols-3 gap-3">
                  {vehicle.price_tiers_json.map((tier, i) => (
                    <div key={i} className="text-center rounded-md border border-zinc-700 bg-zinc-900 p-2.5">
                      <p className="text-xs text-zinc-500 mb-1">
                        {tier.min_days}–{tier.max_days === 999 ? '∞' : tier.max_days} days
                      </p>
                      <p className="font-bold font-montserrat text-gold">{formatCurrency(tier.price_per_day)}</p>
                      <p className="text-[10px] text-zinc-600">/day</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator className="my-6" />

            {/* Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {specs.map(spec => (
                <div key={spec.label} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
                  <div className="flex items-center gap-1.5 text-zinc-500 mb-1">
                    {spec.icon}
                    <p className="text-xs uppercase tracking-wider">{spec.label}</p>
                  </div>
                  <p className="text-sm font-semibold text-white truncate">{spec.value}</p>
                </div>
              ))}
            </div>

            <Separator className="my-6" />

            {/* Descriptions */}
            <div className="space-y-6">
              {(Object.entries(vehicle.description_json) as [string, string[]][]).map(([section, items]) =>
                items.length > 0 && (
                  <div key={section}>
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gold mb-3">
                      {section === 'comfort' ? 'Comfort & Space'
                        : section === 'tech' ? 'Technical Features'
                        : 'Services Included'}
                    </h3>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {items.map(item => (
                        <li key={item} className="flex items-center gap-2 text-sm text-zinc-300">
                          <span className="h-1.5 w-1.5 rounded-full bg-gold/70 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          </div>

          {/* ── Right column: Booking Wizard ── */}
          <div className="xl:sticky xl:top-24 xl:self-start">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-6">
              <h2 className="text-lg font-bold font-montserrat text-white mb-6">Reserve This Vehicle</h2>
              {vehicle.is_available ? (
                <BookingWizard vehicle={vehicle} />
              ) : (
                <div className="text-center py-8 text-zinc-400">
                  <p>This vehicle is currently unavailable.</p>
                  <p className="text-sm mt-2">Please check back later or explore other options.</p>
                  <a href="/fleet" className="text-gold hover:underline text-sm mt-4 block">Browse Available Fleet →</a>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
