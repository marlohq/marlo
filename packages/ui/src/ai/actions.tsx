import type { ComponentProps } from 'react';
import { Button } from '../components/button.tsx';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '../components/tooltip.tsx';
import { cn } from '../lib/utils.ts';

export type ActionsProps = ComponentProps<'div'>;

export const Actions = ({ className, children, ...props }: ActionsProps) => (
	<div className={cn('-ml-1.5 flex items-center gap-px', className)} {...props}>
		{children}
	</div>
);

export type ActionProps = ComponentProps<typeof Button> & {
	tooltip?: string;
	label?: string;
};

export const Action = ({
	tooltip,
	children,
	label,
	className,
	variant = 'ghost',
	size = 'icon',
	...props
}: ActionProps) => {
	const button = (
		<Button
			className={cn(
				'relative size-7 text-neutral-500 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-50',
				className,
			)}
			size={size}
			type="button"
			variant={variant}
			{...props}
		>
			{children}
			<span className="sr-only">{label || tooltip}</span>
		</Button>
	);

	if (tooltip) {
		return (
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>{button}</TooltipTrigger>
					<TooltipContent>
						<p>{tooltip}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return button;
};
