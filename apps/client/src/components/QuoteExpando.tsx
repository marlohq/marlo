import { RiMoreFill } from '@remixicon/react';

export function QuoteChip() {
	return (
		<div className="inline-block cursor-pointer list-none rounded-full border bg-neutral-50 px-1 text-neutral-900">
			<span className="sr-only">Expanded content</span>
			<RiMoreFill className="-my-0.5 size-4" aria-hidden />
		</div>
	);
}

export function QuoteExpando({
	children,
	open,
	onQuoteToggle,
}: {
	children: React.ReactNode;
	open?: boolean;
	onQuoteToggle?: (open: boolean) => void;
}) {
	return (
		<details className="mt-2" open={open} onToggle={(e) => onQuoteToggle?.(e.currentTarget.open)}>
			<summary className="inline-block" title="Expand content">
				<QuoteChip />
			</summary>
			{children}
		</details>
	);
}
