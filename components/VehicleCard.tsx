import Link from 'next/link'
import Image from 'next/image'
import { Fuel, Gauge, Users, Zap, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, getMinPricePerDay } from '@/lib/utils'
import { CATEGORY_LABELS, type Vehicle } from '@/types'

interface VehicleCardProps {
  vehicle: Vehicle
  featured?: boolean
}

export default function VehicleCard({ vehicle, featured = false }: VehicleCardProps) {
  const primaryImage = vehicle.image_urls[0] ?? '/images/placeholder-car.jpg'
  const minPrice     = getMinPricePerDay(vehicle)
  const hasDiscount  = vehicle.price_tiers_json?.length > 1

  return (
    <Link href={`/fleet/${vehicle.id}`} className="block group">
      <Card className={`overflow-hidden transition-all duration-300 hover:border-gold/40 hover:shadow-[0_0_30px_rgba(184,135,70,0.08)] cursor-pointer ${featured ? 'border-gold/30' : ''}`}>
        {/* Image */}
        <div className="relative h-52 overflow-hidden bg-zinc-900">
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent z-10" />
          <Image
            src={primaryImage}
            alt={vehicle.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute top-3 right-3 z-20">
            {vehicle.is_available
              ? <Badge variant="success" className="text-[10px] uppercase tracking-wide">Available</Badge>
              : <Badge variant="destructive" className="text-[10px] uppercase tracking-wide">Unavailable</Badge>}
          </div>
          {featured && (
            <div className="absolute top-3 left-3 z-20">
              <Badge className="text-[10px] uppercase tracking-wide">Featured</Badge>
            </div>
          )}
        </div>

        <CardContent className="p-5">
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs font-medium text-gold/80 uppercase tracking-widest">{vehicle.brand}</p>
              <span className="text-[10px] text-zinc-600 border border-zinc-700 rounded px-1.5 py-0.5 flex items-center gap-1">
                <Star className="h-2.5 w-2.5" />
                {CATEGORY_LABELS[vehicle.category]}
              </span>
            </div>
            <h3 className="text-lg font-bold font-montserrat text-white leading-tight">{vehicle.name}</h3>
          </div>

          {/* Specs pills */}
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
              {vehicle.fuel === 'electric' || vehicle.fuel === 'hybrid'
                ? <Zap className="h-3.5 w-3.5" />
                : <Fuel className="h-3.5 w-3.5" />}
              <span className="capitalize">{vehicle.fuel}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
              <Gauge className="h-3.5 w-3.5" />
              <span className="capitalize">{vehicle.transmission}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-400 bg-zinc-800 px-2.5 py-1 rounded-full">
              <Users className="h-3.5 w-3.5" />
              {vehicle.seats_count} seats
            </span>
          </div>

          {/* Feature preview */}
          {vehicle.description_json.comfort.length > 0 && (
            <ul className="space-y-1 mb-4">
              {vehicle.description_json.comfort.slice(0, 2).map(f => (
                <li key={f} className="flex items-center gap-2 text-xs text-zinc-500">
                  <span className="h-1 w-1 rounded-full bg-gold/60 shrink-0" />{f}
                </li>
              ))}
            </ul>
          )}

          {/* Price */}
          <div className="flex items-end justify-between pt-3 border-t border-zinc-800">
            <div>
              <p className="text-xs text-zinc-500 mb-0.5">From</p>
              <p className="text-2xl font-bold font-montserrat">
                <span className="text-gold">{formatCurrency(minPrice)}</span>
                <span className="text-sm font-normal text-zinc-500"> /day</span>
              </p>
              {hasDiscount && (
                <p className="text-[10px] text-emerald-400 mt-0.5">Lower rates for longer rentals</p>
              )}
            </div>
            <span className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              vehicle.is_available
                ? 'bg-gold-gradient text-rich-black group-hover:opacity-90'
                : 'bg-zinc-800 text-zinc-500'
            }`}>
              {vehicle.is_available ? 'Book Now' : 'Unavailable'}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
