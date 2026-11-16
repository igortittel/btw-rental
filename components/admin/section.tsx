import type { ReactNode } from 'react'

export function Section({ title, description, children, id }: { title: string; description?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border border-gold/40 bg-surface p-5 sm:p-6">
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {description ? <p className="mt-1 text-sm text-muted2">{description}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function PageHeader({ title, action, back }: { title: string; action?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-8 space-y-2">
      {back ? (
        <a href={back.href} className="text-sm text-gold underline-offset-4 hover:underline">
          ← {back.label}
        </a>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-wide text-white">{title}</h1>
        {action}
      </div>
    </div>
  )
}

export function ReadOnlyNotice() {
  return (
    <p className="mb-6 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted2">
      Máte prístup len na čítanie. Úpravy môže robiť manažér alebo majiteľ.
    </p>
  )
}
