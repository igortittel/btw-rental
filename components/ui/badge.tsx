import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold font-montserrat transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-gold text-rich-black',
        outline: 'border-gold/50 text-gold bg-transparent',
        secondary: 'border-transparent bg-zinc-700 text-zinc-200',
        destructive: 'border-transparent bg-red-500/20 text-red-400 border-red-500/30',
        success: 'border-transparent bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
        warning: 'border-transparent bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
