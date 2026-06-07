import { cva, type VariantProps } from 'class-variance-authority'

export { default as Badge } from './Badge.vue'

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-(--accent-soft) text-brand',
        secondary: 'bg-surface-2 text-ink-soft',
        outline: 'border border-line-strong text-ink-soft'
      }
    },
    defaultVariants: { variant: 'default' }
  }
)

export type BadgeVariants = VariantProps<typeof badgeVariants>
