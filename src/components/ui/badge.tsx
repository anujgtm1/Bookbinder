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
          'border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]',
        warning:
          'border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]',
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
