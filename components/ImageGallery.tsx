'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight, ZoomIn, Car } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImageGalleryProps {
  images: string[]
  vehicleName: string
}

export default function ImageGallery({ images, vehicleName }: ImageGalleryProps) {
  const [activeIndex, setActiveIndex]   = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  const prev = useCallback(() =>
    setLightboxIndex(i => (i - 1 + images.length) % images.length), [images.length])
  const next = useCallback(() =>
    setLightboxIndex(i => (i + 1) % images.length), [images.length])

  useEffect(() => {
    if (!lightboxOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      setLightboxOpen(false)
      if (e.key === 'ArrowLeft')   prev()
      if (e.key === 'ArrowRight')  next()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxOpen, prev, next])

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  if (!images.length) {
    return (
      <div className="relative h-72 sm:h-96 rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center mb-8">
        <Car className="h-16 w-16 text-zinc-700" />
      </div>
    )
  }

  return (
    <>
      {/* Main image */}
      <div
        className="relative h-72 sm:h-96 rounded-xl overflow-hidden mb-3 bg-zinc-900 cursor-zoom-in group"
        onClick={() => openLightbox(activeIndex)}
      >
        <Image
          src={images[activeIndex]}
          alt={vehicleName}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          priority
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="text-white opacity-0 group-hover:opacity-100 h-8 w-8 transition-opacity drop-shadow-lg" />
        </div>
        {images.length > 1 && (
          <div className="absolute bottom-3 right-3 bg-black/50 backdrop-blur-sm text-white text-xs px-2 py-1 rounded-full">
            1 / {images.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="grid grid-cols-4 gap-2 mb-8">
          {images.slice(0, 4).map((url, i) => (
            <div
              key={i}
              onClick={() => { setActiveIndex(i); openLightbox(i) }}
              className={cn(
                'relative h-20 rounded-lg overflow-hidden bg-zinc-900 cursor-pointer transition-all',
                activeIndex === i
                  ? 'ring-2 ring-gold ring-offset-2 ring-offset-zinc-950'
                  : 'opacity-60 hover:opacity-100'
              )}
            >
              <Image src={url} alt={`${vehicleName} ${i + 1}`} fill className="object-cover" />
              {i === 3 && images.length > 4 && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">+{images.length - 4}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}
        >
          {/* Close */}
          <button
            className="absolute top-4 right-4 z-10 text-white/60 hover:text-white p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            onClick={() => setLightboxOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>

          {/* Counter */}
          <div className="absolute top-4 left-4 z-10 text-white/50 text-sm font-mono">
            {lightboxIndex + 1} / {images.length}
          </div>

          {/* Prev */}
          {images.length > 1 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              onClick={e => { e.stopPropagation(); prev() }}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}

          {/* Main lightbox image */}
          <div
            className="relative w-full max-w-5xl mx-16 aspect-video"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={images[lightboxIndex]}
              alt={`${vehicleName} ${lightboxIndex + 1}`}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>

          {/* Next */}
          {images.length > 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 z-10 text-white/70 hover:text-white p-3 bg-black/40 hover:bg-black/60 rounded-full transition-colors"
              onClick={e => { e.stopPropagation(); next() }}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}

          {/* Dot indicators */}
          {images.length > 1 && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
              {images.map((_, i) => (
                <button
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    lightboxIndex === i ? 'w-5 bg-gold' : 'w-1.5 bg-white/30 hover:bg-white/60'
                  )}
                />
              ))}
            </div>
          )}

          {/* Thumbnail strip */}
          {images.length > 1 && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex gap-2 max-w-lg overflow-x-auto px-4">
              {images.map((url, i) => (
                <div
                  key={i}
                  onClick={e => { e.stopPropagation(); setLightboxIndex(i) }}
                  className={cn(
                    'relative h-14 w-20 shrink-0 rounded-md overflow-hidden cursor-pointer transition-all',
                    lightboxIndex === i
                      ? 'ring-2 ring-gold opacity-100'
                      : 'opacity-40 hover:opacity-70'
                  )}
                >
                  <Image src={url} alt="" fill className="object-cover" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
