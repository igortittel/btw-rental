'use client'

import { useState, type ComponentProps, type ReactNode } from 'react'
import { DateField, SELECT_CHEVRON_STYLE } from '@/components/ui/date-field'
import { formatTypedDate, parseTypedDate } from '@/lib/booking/schema'
import { cn } from '@/lib/utils'

// Form controls of the public booking form: native elements (reliable on phones),
// 44 px touch targets, visible focus, errors tied to the field for screen readers.

export const controlClass =
  'h-11 w-full rounded-lg border border-line bg-[#141414] px-3 text-base text-white placeholder:text-[#8c8c8c] transition-colors [color-scheme:dark] ' +
  'focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40 aria-[invalid=true]:border-red-400 disabled:opacity-60'

export function Field({
  id,
  label,
  error,
  hint,
  optional,
  required,
  className,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  optional?: string
  /** Label of the "required" mark (the control itself carries aria-required). */
  required?: string
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-white">
        {label}
        {required ? <RequiredMark label={required} /> : null}
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

/**
 * Keeps what the visitor types readable as DD.MM.YYYY: day and month close after two digits
 * (or at a typed separator, "1." -> "01."), dots are added automatically, and pasted or
 * autofilled dates (24/05/1990, 1990-05-24) are normalised.
 */
export function maskTypedDate(raw: string): string {
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`
  const groups = ['', '', '']
  let group = 0
  for (const char of raw) {
    if (/\d/.test(char)) {
      if (group < 2 && groups[group].length === 2) group += 1
      if (group === 2 && groups[2].length === 4) break
      groups[group] += char
    } else if (/[.\/\-\s,]/.test(char) && group < 2 && groups[group].length > 0) {
      groups[group] = groups[group].padStart(2, '0')
      group += 1
    }
  }
  return groups.slice(0, group + 1).join('.')
}

/**
 * Date of birth typed on the keyboard (DD.MM.YYYY) instead of a date picker – scrolling a
 * picker back 20+ years is impractical. Reports YYYY-MM-DD, or '' while incomplete / invalid.
 */
export function TypedDateInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type' | 'value' | 'onChange'> & { value: string; onValueChange: (value: string) => void }) {
  const [text, setText] = useState(() => formatTypedDate(value))
  const [reported, setReported] = useState(value)
  // The value changed from outside (restored draft, profile): show it.
  if (value !== reported) {
    setReported(value)
    if (parseTypedDate(text) !== value) setText(formatTypedDate(value))
  }
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      maxLength={10}
      value={text}
      onChange={(event) => {
        const next = maskTypedDate(event.target.value)
        const parsed = parseTypedDate(next)
        setText(next)
        setReported(parsed)
        onValueChange(parsed)
      }}
      className={cn(controlClass, className)}
    />
  )
}

export function SelectInput({ className, children, style, ...props }: ComponentProps<'select'>) {
  return (
    <select {...props} className={cn(controlClass, 'appearance-none pr-9', className)} style={{ ...SELECT_CHEVRON_STYLE, ...style }}>
      {children}
    </select>
  )
}

/** Visible "required" mark (screen readers get aria-required on the control instead). */
export function RequiredMark({ label }: { label: string }) {
  return (
    <span aria-hidden="true" className="ml-1 text-gold" title={label}>
      *
    </span>
  )
}

export function CheckField({
  id,
  checked,
  onChange,
  error,
  required,
  children,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  /** Label of the "required" mark; when set, the box is marked as required. */
  required?: string
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[15px] leading-6 text-white">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-required={required ? true : undefined}
          {...describe(id, error)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-line bg-[#141414] accent-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        />
        <span>
          {children}
          {required ? <RequiredMark label={required} /> : null}
        </span>
      </label>
      <FieldError id={id} error={error} />
    </div>
  )
}

export function RadioCards<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
  error,
  required,
  stack = false,
}: {
  name: string
  legend: string
  value: string
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  error?: string
  /** Label of the "required" mark; when set, the group is marked as required. */
  required?: string
  /** One option per row (narrow columns). */ stack?: boolean
}) {
  return (
    <fieldset aria-required={required ? true : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-white">
        {legend}
        {required ? <RequiredMark label={required} /> : null}
      </legend>
      <div className={stack ? 'grid gap-2' : options.length === 2 ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2 sm:grid-cols-3'}>
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-[15px] text-white transition-colors focus-within:ring-2 focus-within:ring-gold/40',
              value === option.value ? 'border-gold bg-gold/10' : 'border-line hover:border-gold/60',
            )}
          >
            <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} {...describe(name, error)} className="h-4 w-4 accent-gold" />
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
