'use client'

import { useEffect, useRef, useState } from 'react'
import { buildVehicleSlug, normalizeVin, vehiclePath } from '@/lib/vehicle-url'

/** Live preview of the public URL, computed from the surrounding form's fields. */
export function VehicleUrlPreview({ categorySlugs }: { categorySlugs: Record<string, string> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<string | null>(null)

  useEffect(() => {
    const form = ref.current?.closest('form')
    if (!form) return
    const update = () => {
      const data = new FormData(form)
      const get = (name: string) => String(data.get(name) ?? '').trim()
      const slug = buildVehicleSlug({ brand: get('brand'), model: get('model'), variant: get('variant') })
      const category = categorySlugs[get('category_id')]
      const vin = normalizeVin(get('vin'))
      setPath(slug && category && vin ? vehiclePath(category, slug, vin) : null)
    }
    update()
    form.addEventListener('input', update)
    form.addEventListener('change', update)
    return () => {
      form.removeEventListener('input', update)
      form.removeEventListener('change', update)
    }
  }, [categorySlugs])

  return (
    <div ref={ref} className="rounded-lg border border-line bg-black px-3 py-2 text-sm">
      <span className="text-muted2">URL vozidla: </span>
      <span className="break-all font-mono text-white">{path ? `rental.btw.sk${path}` : 'vyplňte značku, model, kategóriu a VIN'}</span>
    </div>
  )
}
