'use client'

import { useEffect, useState } from 'react'

type Labels = { days: string; hours: string; minutes: string; done: string }

/** Days / hours / minutes left until `target`; re-rendered every 30 s. Rendered only on the client to avoid a server/client time mismatch. */
export function Countdown({ target, title, labels }: { target: string; title: string; labels: Labels }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])

  const left = now === null ? null : Date.parse(target) - now
  const minutes = left === null ? 0 : Math.max(0, Math.floor(left / 60_000))
  const parts = [
    { value: Math.floor(minutes / 1440), label: labels.days },
    { value: Math.floor((minutes % 1440) / 60), label: labels.hours },
    { value: minutes % 60, label: labels.minutes },
  ]

  return (
    <div className="rounded-xl border border-gold bg-surface p-5 text-center" role="timer" aria-live="off">
      <p className="text-xs font-semibold uppercase tracking-widest text-gold">{left !== null && left <= 0 ? labels.done : title}</p>
      <div className="mt-3 grid grid-cols-3 gap-3">
        {parts.map((part) => (
          <div key={part.label}>
            <p className="text-3xl font-bold tabular-nums text-white sm:text-4xl">{left === null ? '–' : part.value}</p>
            <p className="mt-1 text-xs text-muted2">{part.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
