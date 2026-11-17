'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

export type SignaturePadHandle = { clear: () => void; toBlob: () => Promise<Blob | null> }

/**
 * Signature drawn with a finger, stylus or mouse. The canvas is sized once (device pixels)
 * and never resized, so rotating the tablet does not wipe the signature.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, { label: string; onChange: (signed: boolean) => void }>(function SignaturePad({ label, onChange }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    el.width = Math.max(1, Math.round(rect.width * ratio))
    el.height = Math.max(1, Math.round(rect.height * ratio))
    const ctx = el.getContext('2d')!
    ctx.lineWidth = 2.2 * ratio
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1b2a55'
  }, [])

  useImperativeHandle(ref, () => ({
    clear() {
      const el = canvas.current
      if (!el) return
      el.getContext('2d')!.clearRect(0, 0, el.width, el.height)
      onChange(false)
    },
    toBlob: () => new Promise((resolve) => (canvas.current ? canvas.current.toBlob(resolve, 'image/png') : resolve(null))),
  }))

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const el = event.currentTarget
    const rect = el.getBoundingClientRect()
    return [((event.clientX - rect.left) / rect.width) * el.width, ((event.clientY - rect.top) / rect.height) * el.height] as const
  }

  return (
    <div className="relative h-44 rounded-lg border border-dashed border-zinc-500 bg-[#fbfaf7]">
      <canvas
        ref={canvas}
        aria-label={label}
        className="absolute inset-0 h-full w-full touch-none rounded-lg"
        onPointerDown={(event) => {
          drawing.current = true
          event.currentTarget.setPointerCapture(event.pointerId)
          const [x, y] = point(event)
          const ctx = event.currentTarget.getContext('2d')!
          ctx.beginPath()
          ctx.moveTo(x, y)
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return
          const [x, y] = point(event)
          const ctx = event.currentTarget.getContext('2d')!
          ctx.lineTo(x, y)
          ctx.stroke()
          onChange(true)
        }}
        onPointerUp={() => (drawing.current = false)}
        onPointerCancel={() => (drawing.current = false)}
      />
      <span className="pointer-events-none absolute inset-x-4 bottom-9 border-b border-[#c9c2b4]" />
      <span className="pointer-events-none absolute inset-x-0 bottom-2.5 text-center text-[11px] text-[#8a8478]">podpíšte sa prstom alebo perom</span>
    </div>
  )
})
