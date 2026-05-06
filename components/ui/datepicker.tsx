'use client'

import { useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { DayPicker } from 'react-day-picker'
import { format } from 'date-fns'
import { CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DatePickerInputProps {
  value:        string        // 'yyyy-MM-dd'
  onChange:     (v: string) => void
  placeholder?: string
  className?:   string
  minDate?:     Date
  maxDate?:     Date
  disabled?:    boolean
}

export function DatePickerInput({
  value, onChange, placeholder = 'Select date',
  className, minDate, maxDate, disabled = false,
}: DatePickerInputProps) {
  const [open, setOpen] = useState(false)
  const selected = value ? new Date(value + 'T12:00:00') : undefined

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={o => !disabled && setOpen(o)}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-left',
            'focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50',
            'hover:border-zinc-600 transition-colors',
            selected ? 'text-foreground' : 'text-muted-foreground',
            disabled && 'opacity-50 cursor-not-allowed',
            className
          )}
        >
          <span>{selected ? format(selected, 'dd MMM yyyy') : placeholder}</span>
          <CalendarDays className="h-4 w-4 text-zinc-500 shrink-0 ml-2" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            'z-50 rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl p-2',
            'data-[state=open]:animate-in data-[state=closed]:animate-out',
            'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={d => {
              if (d) { onChange(format(d, 'yyyy-MM-dd')); setOpen(false) }
            }}
            disabled={[
              ...(minDate ? [{ before: minDate }] : []),
              ...(maxDate ? [{ after: maxDate }] : []),
            ]}
            classNames={{
              day_selected:     '!bg-gold !text-rich-black font-bold',
              day_today:        'border border-gold/40',
              day_disabled:     'opacity-30 cursor-not-allowed',
              nav_button:       'text-gold hover:bg-gold/10 rounded-md',
              caption:          'text-white font-montserrat font-semibold',
              head_cell:        'text-gold text-xs font-semibold uppercase tracking-wider',
            }}
            styles={{ root: { color: '#d4d4d4' } }}
          />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}
