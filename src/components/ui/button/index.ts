import { cva, type VariantProps } from 'class-variance-authority'

export { default as Button } from './Button.vue'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[18px] [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow-[var(--shadow-1)] hover:-translate-y-px hover:brightness-110',
        secondary: 'bg-secondary text-secondary-foreground border border-line-strong hover:border-brand',
        outline: 'border border-input bg-transparent text-foreground hover:bg-secondary',
        ghost: 'bg-transparent text-ink-soft hover:bg-secondary hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:brightness-110',
        link: 'text-brand underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3 text-[13px]',
        lg: 'h-12 px-7 text-base',
        icon: 'h-11 w-11'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
