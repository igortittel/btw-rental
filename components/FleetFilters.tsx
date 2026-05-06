'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { SlidersHorizontal } from 'lucide-react'

interface FleetFiltersProps {
  brands: string[]
}

export default function FleetFilters({ brands }: FleetFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    value ? params.set(key, value) : params.delete(key)
    router.push(`/fleet?${params.toString()}`)
  }

  const hasFilters = searchParams.has('brand') || searchParams.has('fuel') || searchParams.has('transmission')

  return (
    <div className="flex flex-wrap gap-3 mb-10 pb-6 border-b border-zinc-800">
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <SlidersHorizontal className="h-4 w-4" />
        <span className="font-semibold">Filter:</span>
      </div>

      <select
        defaultValue={searchParams.get('brand') ?? ''}
        onChange={e => update('brand', e.target.value)}
        className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-300 px-3 focus:ring-2 focus:ring-gold/40 focus:border-gold/40 outline-none cursor-pointer"
      >
        <option value="">All Brands</option>
        {brands.map(b => <option key={b} value={b}>{b}</option>)}
      </select>

      <select
        defaultValue={searchParams.get('fuel') ?? ''}
        onChange={e => update('fuel', e.target.value)}
        className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-300 px-3 focus:ring-2 focus:ring-gold/40 focus:border-gold/40 outline-none cursor-pointer"
      >
        <option value="">All Fuel Types</option>
        <option value="petrol">Petrol</option>
        <option value="diesel">Diesel</option>
        <option value="electric">Electric</option>
        <option value="hybrid">Hybrid</option>
      </select>

      <select
        defaultValue={searchParams.get('transmission') ?? ''}
        onChange={e => update('transmission', e.target.value)}
        className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 text-sm text-zinc-300 px-3 focus:ring-2 focus:ring-gold/40 focus:border-gold/40 outline-none cursor-pointer"
      >
        <option value="">All Transmissions</option>
        <option value="automatic">Automatic</option>
        <option value="manual">Manual</option>
      </select>

      {hasFilters && (
        <button
          onClick={() => router.push('/fleet')}
          className="h-9 px-3 rounded-lg border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors"
        >
          Clear All
        </button>
      )}
    </div>
  )
}
