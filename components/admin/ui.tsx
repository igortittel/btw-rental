'use client'

import { createContext, useActionState, useContext, useEffect, useRef, useTransition, type ReactNode } from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Input, type InputProps } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export type FormState = { error?: string; ok?: boolean; message?: string; link?: string }
type Action = (prev: FormState, formData: FormData) => Promise<FormState>

const initial: FormState = {}

export function Feedback({ state }: { state: FormState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
        {state.error}
      </p>
    )
  }
  if (!state.ok) return null
  return (
    <div role="status" className="space-y-2 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm text-white">
      <p>{state.message ?? 'Uložené.'}</p>
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

const PendingContext = createContext(false)

/**
 * <form> bound to a server action, with inline success / error feedback.
 * The action is dispatched manually so that React does not reset the fields: after a
 * validation error everything the user typed stays in place.
 */
export function ActionForm({
  action,
  children,
  className,
  confirm,
  resetOnSuccess = false,
}: {
  action: Action
  children: ReactNode
  className?: string
  /** Ask before submitting (destructive actions). */
  confirm?: string
  /** Clear the fields after a successful submit ("add new" forms). */
  resetOnSuccess?: boolean
}) {
  const [state, dispatch, pending] = useActionState(action, initial)
  const ref = useRef<HTMLFormElement>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset()
  }, [state, resetOnSuccess])

  return (
    <form
      ref={ref}
      className={className}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (confirm && !window.confirm(confirm)) return
        const data = new FormData(e.currentTarget)
        startTransition(() => dispatch(data))
      }}
    >
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      <div className="mt-4 empty:hidden">
        <Feedback state={state} />
      </div>
    </form>
  )
}

export function SubmitButton({ children = 'Uložiť', pendingLabel = 'Ukladám…', ...props }: ButtonProps & { pendingLabel?: string }) {
  const pending = useContext(PendingContext)
  return (
    <Button type="submit" disabled={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  )
}

export const selectClass =
  'h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/50 disabled:opacity-50'

export const textareaClass =
  'min-h-24 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/50'

export function Field({
  label,
  name,
  hint,
  className,
  children,
  ...input
}: InputProps & { label: string; name: string; hint?: string; children?: ReactNode }) {
  const id = input.id ?? name
  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children ?? <Input id={id} name={name} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted2">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function Check({ label, name, defaultChecked, hint }: { label: string; name: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex min-h-10 items-start gap-3 text-sm text-white">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-5 w-5 shrink-0 accent-[#B88746]" />
      <span>
        {label}
        {hint ? <span className="block text-xs text-muted2">{hint}</span> : null}
      </span>
    </label>
  )
}
