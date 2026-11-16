'use client'

import type { ComponentProps } from 'react'

/**
 * <input type="date"> that opens the browser's date picker when clicked anywhere, not
 * only on the small calendar icon, and that cannot grow wider than its container
 * (iOS Safari otherwise gives date inputs a fixed intrinsic width).
 */
export function DateField({ className = '', onClick, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      {...props}
      type="date"
      className={`block min-w-0 max-w-full appearance-none [color-scheme:dark] ${className}`}
      onClick={(event) => {
        onClick?.(event)
        try {
          event.currentTarget.showPicker?.()
        } catch {
          // not allowed in this context (e.g. cross-origin iframe) – the native control still works
        }
      }}
    />
  )
}

/** Gold chevron for selects that use `appearance-none` (the native arrow is drawn inconsistently across browsers). */
export const SELECT_CHEVRON_STYLE = {
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' fill='none' stroke='%23B88746' stroke-width='2'%3E%3Cpath d='m1 1.5 5 5 5-5'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 0.9rem center',
  backgroundSize: '12px 8px',
} as const
