import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ServiceTracker from '@/components/ServiceTracker'
import { createClient } from '@/lib/supabase/server'
import type { Maintenance } from '@/types'

export const metadata = { title: 'Admin — Maintenance' }

export default async function AdminMaintenancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || (user.user_metadata as Record<string,string>)?.role !== 'admin') redirect('/auth/login')

  const { data } = await supabase
    .from('maintenance')
    .select('*, vehicle:vehicles(name, plate)')
    .order('expiration_date', { ascending: true })

  const maintenance = (data ?? []) as (Maintenance & { vehicle?: { name: string; plate: string } })[]

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4">

        <div className="mb-8">
          <Link href="/admin"
            className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-gold transition-colors mb-2">
            <ArrowLeft className="h-3.5 w-3.5" /> Overview
          </Link>
          <h1 className="text-3xl font-black font-montserrat text-white mt-1">Maintenance</h1>
        </div>

        <Card className="border-zinc-800 bg-zinc-900/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-gold" /> Service Tracker
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ServiceTracker
              records={maintenance}
              maintenanceLinkBase="/admin/maintenance/"
            />
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
