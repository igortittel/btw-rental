import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { PageHeader } from '@/components/admin/section'
import { Button } from '@/components/ui/button'
import { hasRole } from '@/lib/auth/roles'
import { requireStaff } from '@/lib/auth/session'
import { formatEuro } from '@/lib/format'
import { vehicleImageUrl } from '@/lib/storage'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Vozidlá' }

type Props = { searchParams: Promise<{ zmazane?: string }> }

export default async function VehiclesPage({ searchParams }: Props) {
  const { zmazane } = await searchParams
  const user = await requireStaff('operator', '/admin/vozidla')
  const supabase = await createClient()
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, name, vin, license_plate, is_active, for_rental, sort_order, vehicle_categories(name), vehicle_images(storage_path, is_main, sort_order), vehicle_prices(price_per_day_cents)')
    .order('sort_order')

  return (
    <div>
      <PageHeader
        title="Vozidlá"
        action={
          hasRole(user.role, 'manager') ? (
            <Button asChild>
              <Link href="/admin/vozidla/nove">Pridať vozidlo</Link>
            </Button>
          ) : null
        }
      />
      {zmazane ? (
        <p role="status" className="mb-6 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-white">
          Vozidlo bolo zmazané.
        </p>
      ) : null}
      <ul className="space-y-3">
        {(vehicles ?? []).map((vehicle) => {
          const images = [...(vehicle.vehicle_images ?? [])].sort((a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order)
          const prices = (vehicle.vehicle_prices ?? []).map((p) => p.price_per_day_cents)
          const category = (vehicle.vehicle_categories?.name as { sk?: string } | undefined)?.sk
          return (
            <li key={vehicle.id}>
              <Link href={`/admin/vozidla/${vehicle.id}`} className="flex items-center gap-4 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-gold sm:p-4">
                <div className="relative h-16 w-24 shrink-0 overflow-hidden rounded-md bg-black sm:h-20 sm:w-32">
                  {images[0] ? <Image src={vehicleImageUrl(images[0].storage_path)} alt="" fill sizes="128px" className="object-contain" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-white">{vehicle.name}</p>
                  <p className="mt-1 break-all text-sm text-muted2">{[category, vehicle.license_plate, vehicle.vin].filter(Boolean).join(' · ')}</p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  <p className="text-white">{prices.length ? `od ${formatEuro(Math.min(...prices))}` : 'bez ceny'}</p>
                  <p className={vehicle.is_active && vehicle.for_rental ? 'text-muted2' : 'text-red-300'}>{!vehicle.is_active ? 'skryté' : vehicle.for_rental ? 'na webe' : 'mimo katalógu'}</p>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
