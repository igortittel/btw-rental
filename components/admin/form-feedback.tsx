'use client'

import type { AdminFormState } from '@/app/admin/actions'

export function FormFeedback({ state }: { state: AdminFormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        {state.error}
      </p>
    )
  }
  if (!state.ok || !state.message) return null
  return (
    <div role="status" className="space-y-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-white">
      <p>{state.message}</p>
      {state.link ? (
        <input
          readOnly
          value={state.link}
          aria-label="Jednorazový odkaz"
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-line bg-black px-2 py-2 font-mono text-xs text-white"
        />
      ) : null}
    </div>
  )
}
