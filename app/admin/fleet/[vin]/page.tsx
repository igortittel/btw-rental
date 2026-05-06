import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import VehicleForm from '@/components/VehicleForm'
import { createClient } from '@/lib/supabase/server'
import type { Vehicle } from '@/types'

export async function generateMetadata({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params
  return { title: `Admin — Edit ${vin}` }
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ vin: string }> }) {
  const { vin } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.user_metadata as Record<string,string>)?.role !== 'admin') redirect('/auth/login')

  const { data, error } = await supabase
    .from('vehicles').select('*').eq('vin', vin.toUpperCase()).single()
  if (error || !data) notFound()
  const vehicle = data as Vehicle

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4 max-w-3xl">
        <Link href="/admin/fleet"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-gold transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" /> All Vehicles
        </Link>
        <div className="mb-6">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest mb-1">Admin · Fleet</Badge>
          <h1 className="text-2xl font-black font-montserrat text-white">{vehicle.name}</h1>
          <p className="text-zinc-500 text-xs font-mono mt-0.5">{vehicle.vin}</p>
        </div>
        <VehicleForm vehicle={vehicle} submitLabel="Save Changes" />
      </div>
    </div>
  )
}
