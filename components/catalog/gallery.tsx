'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import * as Dialog from '@radix-ui/react-dialog'
import { useTranslations } from 'next-intl'

/** `fit: 'contain'` keeps a cut-out studio shot whole; photos fill the frame. */
export type GalleryImage = { id: string; url: string; alt: string; fit?: 'contain' | 'cover' }

/**
 * Photo gallery: a swipeable strip (native scroll-snap, so it works with touch,
 * trackpad and keyboard), thumbnails, and a full-screen lightbox.
 */
export function Gallery({ images }: { images: GalleryImage[] }) {
  const t = useTranslations('vehicle')
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState(false)
  const strip = useRef<HTMLDivElement>(null)

  const go = useCallback(
    (next: number, scroll = true) => {
      const clamped = (next + images.length) % images.length
      setIndex(clamped)
      const el = strip.current
      if (scroll && el) el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' })
    },
    [images.length],
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1, false)
      if (e.key === 'ArrowLeft') go(index - 1, false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, index, go])

  if (images.length === 0) return null
  const arrow = 'absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-gold bg-black/70 text-xl text-white hover:bg-black'

  return (
    <div aria-label={t('gallery')} role="group">
      <div
        ref={strip}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl border border-gold/50 bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          const el = e.currentTarget
          const current = Math.round(el.scrollLeft / el.clientWidth)
          if (current !== index) setIndex(current)
        }}
      >
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            className="relative aspect-[4/3] w-full shrink-0 snap-center"
            onClick={() => {
              setIndex(i)
              setOpen(true)
            }}
            aria-label={`${t('openPhoto')} – ${t('photoOf', { index: i + 1, count: images.length })}`}
          >
            <Image src={image.url} alt={image.alt} fill sizes="(min-width: 1024px) 560px, 100vw" className={image.fit === 'contain' ? 'object-contain p-4 sm:p-6' : 'object-cover'} preload={i === 0} />
          </button>
        ))}
      </div>

      {images.length > 1 ? (
        <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-5">
          {images.map((image, i) => (
            <li key={image.id}>
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={t('photoOf', { index: i + 1, count: images.length })}
                aria-current={i === index ? 'true' : undefined}
                className={`relative block aspect-[4/3] w-full overflow-hidden rounded-lg border bg-surface ${i === index ? 'border-gold' : 'border-line hover:border-gold/60'}`}
              >
                <Image src={image.url} alt="" fill sizes="120px" className={image.fit === 'contain' ? 'object-contain p-1' : 'object-cover'} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/95" />
          <Dialog.Content
            className="fixed inset-0 z-[61] flex items-center justify-center p-4 focus:outline-none"
            aria-describedby={undefined}
            onPointerDown={(e) => {
              const startX = e.clientX
              const target = e.currentTarget
              const up = (ev: PointerEvent) => {
                const dx = ev.clientX - startX
                if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1), false)
                target.removeEventListener('pointerup', up)
              }
              target.addEventListener('pointerup', up)
            }}
          >
            <Dialog.Title className="sr-only">{t('photoOf', { index: index + 1, count: images.length })}</Dialog.Title>
            <div className="relative h-full w-full max-w-5xl">
              <Image src={images[index].url} alt={images[index].alt} fill sizes="100vw" className="select-none object-contain" draggable={false} />
            </div>
            {images.length > 1 ? (
              <>
                <button type="button" className={`${arrow} left-3`} onClick={() => go(index - 1, false)} aria-label={t('prev')}>
                  ←
                </button>
                <button type="button" className={`${arrow} right-3`} onClick={() => go(index + 1, false)} aria-label={t('next')}>
                  →
                </button>
              </>
            ) : null}
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-white" aria-hidden="true">
              {index + 1} / {images.length}
            </p>
            <Dialog.Close
              className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-full border border-gold bg-black/70 text-xl text-white hover:bg-black"
              aria-label={t('close')}
            >
              ×
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
