import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import VehicleForm from '@/components/VehicleForm'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: 'Admin — Add Vehicle' }

export default async function NewVehiclePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.user_metadata as Record<string,string>)?.role !== 'admin') redirect('/dashboard')

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/admin/vehicles"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to Vehicles
        </Link>
        <div className="mb-6">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-1">Admin</Badge>
          <h1 className="text-2xl font-black font-montserrat text-white">Add New Vehicle</h1>
        </div>
        <VehicleForm submitLabel="Create Vehicle" />
      </div>
    </div>
  )
}
