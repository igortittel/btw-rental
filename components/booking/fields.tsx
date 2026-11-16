'use client'

import type { ComponentProps, ReactNode } from 'react'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { cn } from '@/lib/utils'

// Form controls of the public booking form: native elements (reliable on phones),
// 44 px touch targets, visible focus, errors tied to the field for screen readers.

export const controlClass =
  'h-11 w-full rounded-lg border border-line bg-[#141414] px-3 text-base text-white placeholder:text-[#8c8c8c] transition-colors [color-scheme:dark] ' +
  'focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 aria-[invalid=true]:border-red-400 disabled:opacity-60'

export function Field({ id, label, error, hint, optional, className, children }: { id: string; label: string; error?: string; hint?: string; optional?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white">
        {label}
        {optional ? <span className="ml-1.5 font-normal text-muted2">({optional})</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted2">
          {hint}
        </p>
      ) : null}
      <FieldError id={id} error={error} />
    </div>
  )
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null
  return (
    <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-red-300">
      {error}
    </p>
  )
}

/** aria attributes linking a control to its hint / error. */
export function describe(id: string, error?: string, hint?: string) {
  return { 'aria-invalid': error ? true : undefined, 'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined } as const
}

export function TextInput({ className, ...props }: ComponentProps<'input'>) {
  return <input {...props} className={cn(controlClass, className)} />
}

export function DateInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <DateField {...props} className={cn(controlClass, className)} />
}

export function SelectInput({ className, children, style, ...props }: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(controlClass, 'appearance-none pr-9', className)}
      style={{ ...SELECT_CHEVRON_STYLE, ...style }}
    >
      {children}
    </select>
  )
}

export function CheckField({ id, checked, onChange, error, children }: { id: string; checked: boolean; onChange: (checked: boolean) => void; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[15px] leading-6 text-white">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          {...describe(id, error)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line bg-[#141414] accent-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        />
        <span>{children}</span>
      </label>
      <FieldError id={id} error={error} />
    </div>
  )
}

export function RadioCards<T extends string>({ name, legend, value, options, onChange, error, stack = false }: { name: string; legend: string; value: string; options: { value: T; label: string }[]; onChange: (value: T) => void; error?: string; /** One option per row (narrow columns). */ stack?: boolean }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-white">{legend}</legend>
      <div className={stack ? 'grid gap-2' : 'grid gap-2 sm:grid-cols-3'}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[15px] text-white transition-colors focus-within:ring-2 focus-within:ring-gold/40',
              value === option.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/60',
            )}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="h-4 w-4 accent-gold" />
            {option.label}
          </label>
        ))}
      </div>
      <FieldError id={name} error={error} />
    </fieldset>
  )
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-gold/40 bg-surface p-5 sm:p-6', className)}>
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="text-lg font-bold text-white">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  )
}
