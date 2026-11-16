import type { ReactNode } from 'react'

export function AuthCard({ title, lead, children, footer }: { title: string; lead?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-md px-6 pb-20 pt-32">
      <div className="rounded-xl border border-gold/60 bg-surface p-8">
        <h1 className="text-2xl font-bold tracking-wide text-white">{title}</h1>
        {lead ? <p className="mt-3 text-sm leading-6 text-muted2">{lead}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
      {footer ? <div className="mt-6 text-center text-sm text-muted2">{footer}</div> : null}
    </section>
  )
}
