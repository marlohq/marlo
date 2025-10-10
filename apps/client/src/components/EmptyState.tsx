import type { ReactNode } from 'react';
import { cn } from '../lib/util.ts';

export function EmptyState({ message }: { message: ReactNode }) {
	return (
		<div className={cn('flex h-10 h-full w-full flex-col items-center justify-center gap-2 px-8')}>
			<p className="text-neutral-500">{message}</p>
		</div>
	);
}
