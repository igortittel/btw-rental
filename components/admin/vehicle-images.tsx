'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { deleteVehicleImageAction, registerVehicleImagesAction, reorderVehicleImagesAction, saveVehicleImageAltAction, setMainVehicleImageAction } from '@/app/admin/vozidla/actions'
import { Feedback, type FormState } from '@/components/admin/ui'
import { Button } from '@/components/ui/button'
import { VEHICLE_IMAGES_BUCKET } from '@/lib/storage'
import { createClient } from '@/lib/supabase/client'

export type VehicleImage = { id: string; url: string; isMain: boolean; alt: { sk: string; en: string } }

const MAX_EDGE = 2000

/** Downscales and re-encodes in the browser so uploads stay small even from a phone camera. */
async function compress(file: File): Promise<{ blob: Blob; width: number; height: number; ext: string }> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85))
  // Browsers that cannot encode WebP silently fall back to PNG; use JPEG there instead.
  let blob = await encode('image/webp')
  let ext = 'webp'
  if (!blob || blob.type !== 'image/webp') {
    blob = await encode('image/jpeg')
    ext = 'jpg'
  }
  if (!blob) throw new Error('encode failed')
  return { blob, width, height, ext }
}

export function VehicleImages({ vehicleId, images, canEdit }: { vehicleId: string; images: VehicleImage[]; canEdit: boolean }) {
  const [order, setOrder] = useState(images)
  const [syncedFrom, setSyncedFrom] = useState(images)
  const [state, setState] = useState<FormState>({})
  const [progress, setProgress] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [editingAlt, setEditingAlt] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  // Adopt fresh server data after a revalidation.
  if (images !== syncedFrom) {
    setSyncedFrom(images)
    setOrder(images)
  }

  const run = (fn: () => Promise<FormState>) => startTransition(async () => setState(await fn()))

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return
    const next = [...order]
    next.splice(to, 0, ...next.splice(from, 1))
    setOrder(next)
    run(() =>
      reorderVehicleImagesAction(
        vehicleId,
        next.map((i) => i.id),
      ),
    )
  }

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setState({})
    const supabase = createClient()
    const uploaded: { path: string; width: number; height: number }[] = []
    let failed = 0
    for (const [index, file] of [...files].entries()) {
      setProgress(`Nahrávam ${index + 1} / ${files.length}…`)
      try {
        const { blob, width, height, ext } = await compress(file)
        const path = `${vehicleId}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from(VEHICLE_IMAGES_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' })
        if (error) throw error
        uploaded.push({ path, width, height })
      } catch (e) {
        console.error(e)
        failed++
      }
    }
    setProgress(null)
    if (input.current) input.current.value = ''
    if (uploaded.length === 0) {
      setState({ error: 'Fotky sa nepodarilo nahrať. Podporované sú JPG, PNG a WebP.' })
      return
    }
    run(async () => {
      const result = await registerVehicleImagesAction(vehicleId, uploaded)
      return failed > 0 && result.ok ? { ...result, message: `${result.message} Nepodarilo sa: ${failed}.` } : result
    })
  }

  return (
    <div className="space-y-5">
      {order.length === 0 ? <p className="text-sm text-muted2">Vozidlo zatiaľ nemá žiadne fotky.</p> : null}
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {order.map((image, index) => (
          <li
            key={image.id}
            draggable={canEdit}
            onDragStart={() => setDragId(image.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = order.findIndex((i) => i.id === dragId)
              if (from >= 0) move(from, index)
              setDragId(null)
            }}
            className={`rounded-lg border bg-black p-2 ${image.isMain ? 'border-gold' : 'border-line'} ${canEdit ? 'cursor-grab' : ''} ${dragId === image.id ? 'opacity-50' : ''}`}
          >
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-surface">
              <Image src={image.url} alt={image.alt.sk} fill sizes="(min-width: 1024px) 220px, 45vw" className="object-contain" />
            </div>
            <p className="mt-2 text-xs text-muted2">{image.isMain ? 'Hlavná fotka' : `Poradie ${index + 1}`}</p>
            <p className="mt-1 break-words text-xs text-white" title="Popis fotky (alt text)">
              {image.alt.sk || '—'}
              {image.alt.en ? <span className="text-muted2"> · EN: {image.alt.en}</span> : <span className="text-amber-200"> · bez EN</span>}
            </p>
            {canEdit && editingAlt === image.id ? (
              <form
                className="mt-2 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault()
                  const data = new FormData(event.currentTarget)
                  run(async () => {
                    const result = await saveVehicleImageAltAction(vehicleId, image.id, { sk: String(data.get('alt_sk') ?? ''), en: String(data.get('alt_en') ?? '') })
                    if (result.ok) setEditingAlt(null)
                    return result
                  })
                }}
              >
                <label className="block text-xs text-muted2">
                  Popis (SK)
                  <input name="alt_sk" defaultValue={image.alt.sk} maxLength={200} required className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-white" />
                </label>
                <label className="block text-xs text-muted2">
                  Popis (EN)
                  <input name="alt_en" defaultValue={image.alt.en} maxLength={200} className="mt-1 h-9 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 text-sm text-white" />
                </label>
                <div className="flex gap-1">
                  <Button type="submit" size="sm" disabled={pending}>
                    Uložiť
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setEditingAlt(null)}>
                    Zrušiť
                  </Button>
                </div>
              </form>
            ) : null}
            {canEdit ? (
              <div className="mt-2 flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={pending || index === 0} onClick={() => move(index, index - 1)} aria-label="Posunúť dopredu">
                  ←
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={pending || index === order.length - 1} onClick={() => move(index, index + 1)} aria-label="Posunúť dozadu">
                  →
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setEditingAlt(editingAlt === image.id ? null : image.id)}>
                  Popis
                </Button>
                {image.isMain ? null : (
                  <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setMainVehicleImageAction(vehicleId, image.id))}>
                    Hlavná
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm('Naozaj zmazať túto fotku?')) run(() => deleteVehicleImageAction(vehicleId, image.id))
                  }}
                >
                  Zmazať
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div className="space-y-2">
          <label htmlFor="vehicle-image-upload" className="block text-sm font-medium text-zinc-300">
            Pridať fotky
          </label>
          <input
            ref={input}
            id="vehicle-image-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={!!progress || pending}
            onChange={(e) => upload(e.target.files)}
            className="block w-full text-sm text-muted2 file:mr-4 file:h-10 file:cursor-pointer file:rounded-lg file:border-0 file:bg-gold file:px-4 file:font-semibold file:text-white"
          />
          <p className="text-xs text-muted2">JPG, PNG alebo WebP. Fotky sa pred nahratím zmenšia na max. {MAX_EDGE} px. Poradie zmeníte ťahaním alebo šípkami.</p>
          {progress ? <p className="text-sm text-white">{progress}</p> : null}
        </div>
      ) : null}
      <Feedback state={state} />
    </div>
  )
}
