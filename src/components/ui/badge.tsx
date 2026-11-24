import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-[2px] border px-2 py-0.5 text-xs font-medium motion-safe:transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-border/60 bg-secondary text-secondary-foreground',
        outline: 'border-border text-foreground',
        brass:
          'border-brass/45 bg-brass/12 text-foreground',
        vermilion:
          'border-vermilion/55 bg-vermilion/10 text-vermilion',
        success:
          'border-emerald-700/35 bg-emerald-600/12 text-emerald-900 dark:text-emerald-300',
        warning:
          'border-amber-700/40 bg-amber-500/14 text-amber-900 dark:text-amber-300',
        destructive:
          'border-destructive/35 bg-destructive/12 text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
