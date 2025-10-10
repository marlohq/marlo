import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';
import { cn } from '../lib/utils.ts';

// NOTE: This file is capitalized for legacy reasons. Git doesn't like case-sensitive file renames.

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
	({ className, ...props }: ResponseProps) => (
		<Streamdown
			className={cn('size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0', className)}
			{...props}
		/>
	),
	(prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = 'Response';
