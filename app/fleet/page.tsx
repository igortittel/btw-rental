import VehicleCard from '@/components/VehicleCard'
import { createClient } from '@/lib/supabase/server'
import type { Vehicle } from '@/types'

export const metadata = { title: 'Our Fleet' }

export default async function FleetPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('vehicles')
    .select('*')
    .order('daily_price', { ascending: false })

  const vehicles = (data ?? []) as Vehicle[]

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(184,135,70,0.04)_0%,transparent_50%)] pointer-events-none" />
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {vehicles.map(vehicle => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
          {vehicles.length === 0 && (
            <div className="col-span-full text-center py-20 text-zinc-500">
              No vehicles available at the moment.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
