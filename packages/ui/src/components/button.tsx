import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils.ts';

const buttonVariants = cva(
	'inline-flex items-center font-medium justify-center gap-1.5 -outline-offset-1 whitespace-nowrap rounded-md text-base transition-all duration-300 easeInOut focus-visible:outline-none focus-visible:ring-[1.5px] focus-visible:ring-offset-2 focus-visible:ring-neutral-400/80 disabled:pointer-events-none disabled:opacity-50 dark:focus-visible:ring-neutral-300',
	{
		variants: {
			variant: {
				default:
					'bg-white text-neutral-900 outline outline-1  outline-neutral-900/15 shadow-md hover:bg-neutral-100  dark:bg-neutral-50 dark:text-neutral-900 dark:hover:bg-neutral-50/90 focus-visible:ring-neutral-400/80',
				destructive:
					'bg-red-500 text-neutral-50 hover:bg-red-500/90 dark:bg-red-900 dark:text-neutral-50 dark:hover:bg-red-900/90',
				outline:
					'outline outline-1  outline-neutral-900/15 bg-white text-neutral-900 hover:bg-neutral-100 hover:text-neutral-950 dark:outline-neutral-900/50 dark:bg-neutral-950 dark:hover:bg-neutral-800 dark:hover:text-neutral-50',
				secondary:
					'bg-neutral-200 text-neutral-700 hover:bg-neutral-300 hover:text-neutral-900  dark:bg-neutral-800 dark:text-neutral-50 dark:hover:bg-neutral-800/80',
				ghost:
					'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/70 dark:hover:bg-neutral-800 dark:hover:text-neutral-50',
				link: 'text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-50',
			},
			size: {
				default: 'h-8 px-3',
				sm: 'h-7 gap-1 px-2 text-sm',
				lg: 'h-9 gap-2 px-4',
				icon: 'h-8 w-8',
				xl: 'h-12 rounded-xl px-8 text-lg',
			},
		},
		defaultVariants: {
			variant: 'default',
			size: 'default',
		},
	},
);

export interface ButtonProps
	extends React.ButtonHTMLAttributes<HTMLButtonElement>,
		VariantProps<typeof buttonVariants> {
	asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
	({ className, variant, size, asChild = false, ...props }, ref) => {
		const Comp = asChild ? Slot : 'button';
		return (
			<Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
		);
	},
);
Button.displayName = 'Button';

export { Button, buttonVariants };
