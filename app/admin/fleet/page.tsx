'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, ArrowLeft, LayoutGrid, List, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import VehicleCard from '@/components/VehicleCard'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { CATEGORY_LABELS, type Vehicle } from '@/types'

export default function AdminFleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading,  setLoading]  = useState(true)
  const [view,     setView]     = useState<'list' | 'grid'>('list')

  useEffect(() => {
    createClient()
      .from('vehicles').select('*').order('daily_price', { ascending: false })
      .then(({ data }) => { setVehicles((data ?? []) as Vehicle[]); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="container mx-auto px-4">

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <Link href="/admin"
              className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-gold transition-colors mb-2">
              <ArrowLeft className="h-3.5 w-3.5" /> Overview
            </Link>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">Admin · Fleet</Badge>
            </div>
            <h1 className="text-3xl font-black font-montserrat text-white mt-1">
              Fleet
              {!loading && <span className="text-lg font-normal text-zinc-500 ml-3">{vehicles.length} vehicles</span>}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
              <button
                onClick={() => setView('list')}
                className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                onClick={() => setView('grid')}
                className={`p-1.5 rounded-md transition-colors ${view === 'grid' ? 'bg-gold text-rich-black' : 'text-zinc-400 hover:text-white'}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
            <Button asChild>
              <Link href="/admin/fleet/new"><Plus className="h-4 w-4" /> Add Vehicle</Link>
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {vehicles.map(v => (
              <div key={v.id} className="relative group">
                <VehicleCard vehicle={v} />
                <div className="absolute top-3 left-3 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button asChild size="sm" variant="secondary" className="shadow-lg">
                    <Link href={`/admin/fleet/${v.vin}`}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
            {vehicles.length === 0 && (
              <div className="col-span-full text-center py-20 text-zinc-500">
                No vehicles yet.{' '}
                <Link href="/admin/fleet/new" className="text-gold hover:underline">Add one</Link>
              </div>
            )}
          </div>
        ) : (
          <Card className="border-zinc-800 bg-zinc-900/50">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 bg-zinc-900/60 text-left text-xs uppercase tracking-wider text-zinc-500">
                      <th className="px-4 py-3">Vehicle</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Plate / VIN</th>
                      <th className="px-4 py-3">Seats</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/50">
                    {vehicles.map(v => (
                      <tr
                        key={v.id}
                        className="hover:bg-zinc-800/20 transition-colors cursor-pointer"
                        onClick={() => window.location.href = `/admin/fleet/${v.vin}`}
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-white">{v.name}</p>
                          <p className="text-xs text-zinc-500">{v.brand} · {v.year} · {v.fuel}</p>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABELS[v.category]}</Badge>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">
                          <p>{v.plate}</p>
                          <p className="text-zinc-600">{v.vin.slice(-8)}</p>
                        </td>
                        <td className="px-4 py-3 text-zinc-300">{v.seats_count}</td>
                        <td className="px-4 py-3 font-bold font-montserrat text-gold">
                          {formatCurrency(v.daily_price)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={v.is_available ? 'success' : 'destructive'} className="text-[10px]">
                            {v.is_available ? 'Available' : 'Unavailable'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/admin/fleet/${v.vin}`}>
                                <Pencil className="h-3.5 w-3.5" /> Edit
                              </Link>
                            </Button>
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/fleet/${v.id}`} target="_blank">View</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {vehicles.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                          No vehicles yet.{' '}
                          <Link href="/admin/fleet/new" className="text-gold hover:underline">Add one</Link>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
