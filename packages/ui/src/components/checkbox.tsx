import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { RiCheckLine } from '@remixicon/react';
import * as React from 'react';
import { cn } from '../lib/utils.ts';

const Checkbox = React.forwardRef<
	React.ElementRef<typeof CheckboxPrimitive.Root>,
	React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
	<CheckboxPrimitive.Root
		ref={ref}
		className={cn(
			'peer h-4 w-4 shrink-0 rounded border-[1.5px] border-neutral-300 shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-950 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-neutral-900 data-[state=checked]:bg-neutral-900 data-[state=unchecked]:bg-white data-[state=checked]:text-neutral-50 dark:border-neutral-700 dark:focus-visible:ring-neutral-300 dark:data-[state=checked]:bg-neutral-50 dark:data-[state=checked]:text-neutral-900',
			className,
		)}
		{...props}
	>
		<CheckboxPrimitive.Indicator className={cn('flex items-center justify-center text-current')}>
			<RiCheckLine className="h-3 w-3" aria-hidden />
		</CheckboxPrimitive.Indicator>
	</CheckboxPrimitive.Root>
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
