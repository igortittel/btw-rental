'use client'

import { useState, useTransition, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, AlertTriangle, Upload, Star, Image as ImageIcon } from 'lucide-react'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { Label }    from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Vehicle } from '@/types'

interface FormState {
  name: string; brand: string; model: string; year: string
  vin: string; plate: string; engine: string
  transmission: 'automatic' | 'manual'
  fuel: 'petrol' | 'diesel' | 'electric' | 'hybrid'
  category: 'first_class' | 'business_class' | 'business_van'
  seats_count: string; daily_price: string; is_available: boolean
  image_urls: string[]
  comfort: string[]; tech: string[]; services: string[]
  price_tiers: { min_days: string; max_days: string; price_per_day: string }[]
}

function toFormState(v?: Vehicle): FormState {
  return {
    name: v?.name ?? '', brand: v?.brand ?? '', model: v?.model ?? '',
    year: v ? String(v.year) : String(new Date().getFullYear()),
    vin: v?.vin ?? '', plate: v?.plate ?? '', engine: v?.engine ?? '',
    transmission: v?.transmission ?? 'automatic',
    fuel: v?.fuel ?? 'petrol',
    category: v?.category ?? 'first_class',
    seats_count: v ? String(v.seats_count) : '5',
    daily_price: v ? String(v.daily_price) : '',
    is_available: v?.is_available ?? true,
    image_urls: v?.image_urls?.length ? [...v.image_urls] : [],
    comfort:  v?.description_json?.comfort?.length  ? [...v.description_json.comfort]  : [''],
    tech:     v?.description_json?.tech?.length     ? [...v.description_json.tech]     : [''],
    services: v?.description_json?.services?.length ? [...v.description_json.services] : [''],
    price_tiers: v?.price_tiers_json?.length
      ? v.price_tiers_json.map(t => ({ min_days: String(t.min_days), max_days: String(t.max_days), price_per_day: String(t.price_per_day) }))
      : [],
  }
}

function DynamicList({ label, values, onChange, placeholder }: {
  label: string; values: string[]
  onChange: (v: string[]) => void; placeholder?: string
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {values.map((val, i) => (
        <div key={i} className="flex gap-2">
          <Input value={val} onChange={e => onChange(values.map((x, j) => j === i ? e.target.value : x))}
            placeholder={placeholder} className="flex-1" />
          <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="p-2 text-zinc-500 hover:text-red-400 transition-colors">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...values, ''])}
        className="flex items-center gap-1.5 text-xs text-gold hover:text-gold/80">
        <Plus className="h-3.5 w-3.5" /> Add
      </button>
    </div>
  )
}

function ImageUploader({ images, onChange }: {
  images: string[]; onChange: (imgs: string[]) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const uploadFiles = useCallback(async (files: FileList) => {
    setUploading(true)
    const supabase = createClient()
    const uploaded: string[] = []
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('vehicle-images').upload(path, file, { cacheControl: '3600' })
      if (!error) {
        const { data } = supabase.storage.from('vehicle-images').getPublicUrl(path)
        uploaded.push(data.publicUrl)
      }
    }
    onChange([...images, ...uploaded])
    setUploading(false)
  }, [images, onChange])

  const setCover = (i: number) => {
    const copy = [...images]
    const [item] = copy.splice(i, 1)
    onChange([item, ...copy])
  }

  const remove = (i: number) => onChange(images.filter((_, j) => j !== i))

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all',
          isDragging ? 'border-gold bg-gold/5 scale-[1.01]' : 'border-zinc-700 hover:border-zinc-500'
        )}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
            <span className="text-sm text-zinc-400">Uploading…</span>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-sm text-zinc-300 font-medium">Click to upload or drag & drop</p>
            <p className="text-xs text-zinc-600 mt-1">PNG, JPG, WebP — multiple files supported</p>
          </>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => e.target.files && uploadFiles(e.target.files)} />
      </div>

      {/* Preview grid */}
      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((url, i) => (
            <div key={i} className="relative group rounded-xl overflow-hidden bg-zinc-800 aspect-video border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="w-full h-full object-cover" onError={e => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="60"><rect fill="%23333"/></svg>'
              }} />

              {/* Cover badge */}
              {i === 0 && (
                <div className="absolute top-1.5 left-1.5 bg-gold text-rich-black text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="h-2.5 w-2.5" /> Cover
                </div>
              )}

              {/* Hover actions */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {i !== 0 && (
                  <button type="button" onClick={() => setCover(i)} title="Set as cover"
                    className="flex items-center gap-1 text-xs bg-gold text-rich-black px-2.5 py-1.5 rounded-lg font-bold hover:opacity-90">
                    <Star className="h-3.5 w-3.5" /> Cover
                  </button>
                )}
                <button type="button" onClick={() => remove(i)}
                  className="text-xs bg-red-500/80 text-white px-2.5 py-1.5 rounded-lg hover:bg-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {images.length === 0 && (
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <ImageIcon className="h-4 w-4" /> No images yet — upload at least one.
        </div>
      )}
    </div>
  )
}

export default function VehicleForm({ vehicle, submitLabel }: {
  vehicle?: Vehicle; submitLabel: string
}) {
  const router = useRouter()
  const [form, setForm]       = useState<FormState>(() => toFormState(vehicle))
  const [error, setError]     = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm(p => ({ ...p, [key]: val }))

  const setTier = (i: number, field: string, val: string) =>
    setForm(p => ({ ...p, price_tiers: p.price_tiers.map((t, j) => j === i ? { ...t, [field]: val } : t) }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault(); setError(null)

    const payload = {
      name: form.name.trim(), brand: form.brand.trim(), model: form.model.trim(),
      year: parseInt(form.year) || new Date().getFullYear(),
      vin: form.vin.trim().toUpperCase(), plate: form.plate.trim().toUpperCase(),
      engine: form.engine.trim(),
      transmission: form.transmission, fuel: form.fuel, category: form.category,
      seats_count: parseInt(form.seats_count) || 5,
      daily_price: parseFloat(form.daily_price) || 0,
      is_available: form.is_available,
      image_urls: form.image_urls.filter(u => u.trim()),
      description_json: {
        comfort: form.comfort.filter(s => s.trim()),
        tech: form.tech.filter(s => s.trim()),
        services: form.services.filter(s => s.trim()),
      },
      price_tiers_json: form.price_tiers
        .filter(t => t.min_days && t.max_days && t.price_per_day)
        .map(t => ({ min_days: parseInt(t.min_days), max_days: parseInt(t.max_days), price_per_day: parseFloat(t.price_per_day) })),
    }

    if (!payload.name || !payload.brand || !payload.vin || !payload.plate) {
      setError('Name, brand, VIN and plate are required.'); return
    }

    startTransition(async () => {
      const supabase = createClient()
      let { error: dbErr } = vehicle
        ? await supabase.from('vehicles').update(payload).eq('id', vehicle.id)
        : await supabase.from('vehicles').insert(payload)

      // Supabase schema cache sometimes doesn't recognise the 'category' column —
      // retry without it so the rest of the data still saves.
      if (dbErr?.message?.includes("'category'")) {
        const { category: _cat, ...payloadWithoutCategory } = payload as any
        const retry = vehicle
          ? await supabase.from('vehicles').update(payloadWithoutCategory).eq('id', vehicle.id)
          : await supabase.from('vehicles').insert(payloadWithoutCategory)
        dbErr = retry.error
      }

      if (dbErr) { setError(dbErr.message); return }
      router.push('/admin/fleet'); router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">

      {/* Basic Info */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader><CardTitle className="text-base">Basic Information</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="col-span-2 space-y-1.5">
            <Label>Vehicle Name *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Porsche Cayenne S" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Brand *</Label><Input value={form.brand} onChange={e => set('brand', e.target.value)} placeholder="Porsche" /></div>
            <div className="space-y-1.5"><Label>Model *</Label><Input value={form.model} onChange={e => set('model', e.target.value)} placeholder="Cayenne S" /></div>
            <div className="space-y-1.5"><Label>Year</Label><Input type="number" value={form.year} onChange={e => set('year', e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Engine</Label><Input value={form.engine} onChange={e => set('engine', e.target.value)} placeholder="2.9L V6 440hp" /></div>
            <div className="space-y-1.5"><Label>VIN *</Label><Input value={form.vin} onChange={e => set('vin', e.target.value.toUpperCase())} className="font-mono" /></div>
            <div className="space-y-1.5"><Label>Plate *</Label><Input value={form.plate} onChange={e => set('plate', e.target.value.toUpperCase())} className="font-mono" /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>Transmission</Label>
              <Select value={form.transmission} onValueChange={v => set('transmission', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="automatic">Automatic</SelectItem><SelectItem value="manual">Manual</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Fuel</Label>
              <Select value={form.fuel} onValueChange={v => set('fuel', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="petrol">Petrol</SelectItem><SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Electric</SelectItem><SelectItem value="hybrid">Hybrid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_class">First Class</SelectItem>
                  <SelectItem value="business_class">Business Class</SelectItem>
                  <SelectItem value="business_van">Business Van</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Seats</Label><Input type="number" value={form.seats_count} onChange={e => set('seats_count', e.target.value)} min={1} max={9} /></div>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox checked={form.is_available} onCheckedChange={v => set('is_available', !!v)} id="avail" />
            <Label htmlFor="avail" className="cursor-pointer">Available for rental</Label>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader><CardTitle className="text-base">Photos</CardTitle></CardHeader>
        <CardContent>
          <ImageUploader images={form.image_urls} onChange={v => set('image_urls', v)} />
        </CardContent>
      </Card>

      {/* Pricing */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader><CardTitle className="text-base">Pricing</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Base Daily Price (€) *</Label>
            <Input type="number" value={form.daily_price} onChange={e => set('daily_price', e.target.value)} placeholder="350" step="0.01" className="max-w-xs" />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Price Tiers <span className="text-zinc-600 font-normal">(override base by duration)</span></Label>
              <button type="button" onClick={() => setForm(p => ({ ...p, price_tiers: [...p.price_tiers, { min_days: '', max_days: '', price_per_day: '' }] }))}
                className="flex items-center gap-1 text-xs text-gold hover:text-gold/80">
                <Plus className="h-3.5 w-3.5" /> Add Tier
              </button>
            </div>
            {form.price_tiers.map((tier, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input type="number" value={tier.min_days} onChange={e => setTier(i, 'min_days', e.target.value)} placeholder="Min" className="w-20" />
                <span className="text-zinc-600 text-xs">–</span>
                <Input type="number" value={tier.max_days} onChange={e => setTier(i, 'max_days', e.target.value)} placeholder="Max" className="w-24" />
                <span className="text-zinc-600 text-xs">days:</span>
                <Input type="number" value={tier.price_per_day} onChange={e => setTier(i, 'price_per_day', e.target.value)} placeholder="€/day" step="0.01" className="w-28" />
                <button type="button" onClick={() => setForm(p => ({ ...p, price_tiers: p.price_tiers.filter((_, j) => j !== i) }))} className="text-zinc-500 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Description */}
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <DynamicList label="Comfort & Space" values={form.comfort} onChange={v => set('comfort', v)} placeholder="e.g. Panoramic roof" />
          <DynamicList label="Technical Features" values={form.tech} onChange={v => set('tech', v)} placeholder="e.g. Head-up display" />
          <DynamicList label="Services Included" values={form.services} onChange={v => set('services', v)} placeholder="e.g. Full insurance" />
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" className="flex-1" disabled={isPending}>
          {isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : submitLabel}
        </Button>
      </div>
    </form>
  )
}
