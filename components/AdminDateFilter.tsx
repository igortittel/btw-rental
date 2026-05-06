'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DatePickerInput } from '@/components/ui/datepicker'

interface AdminDateFilterProps {
  defaultFrom: string
  defaultTo:   string
  basePath?:   string
}

export default function AdminDateFilter({
  defaultFrom,
  defaultTo,
  basePath = '/admin',
}: AdminDateFilterProps) {
  const router = useRouter()
  const [from, setFrom] = useState(defaultFrom)
  const [to,   setTo]   = useState(defaultTo)

  const apply = () => router.push(`${basePath}?from=${from}&to=${to}`)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <DatePickerInput value={from} onChange={setFrom} className="w-36" />
      <span className="text-zinc-600 text-xs">→</span>
      <DatePickerInput value={to} onChange={setTo} className="w-36" />
      <button
        onClick={apply}
        className="h-10 px-4 rounded-lg bg-gold text-rich-black text-sm font-bold hover:opacity-90 transition-opacity shrink-0"
      >
        Apply
      </button>
    </div>
  )
}
