import { RiCheckFill } from '@remixicon/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@workspace/ui';
import { useEffect, useRef, useState } from 'react';

export function CopyField({
	text,
	copyLabel,
	children,
}: {
	text: string;
	copyLabel: string;
	children: React.ReactNode;
}) {
	const [isCopied, setIsCopied] = useState(false);
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (isOpen) return;

		// Reset "copied" text after tooltip animation finishes
		const timeout = window.setTimeout(() => {
			setIsCopied(false);
		}, 150);

		return () => clearTimeout(timeout);
	}, [isOpen]);

	return (
		<Tooltip open={isOpen} onOpenChange={setIsOpen} delayDuration={300}>
			<TooltipTrigger
				ref={triggerRef}
				className="hover:underline"
				onClick={async (e) => {
					e.preventDefault();
					e.stopPropagation();
					await navigator.clipboard.writeText(text);
					setIsCopied(true);
					setIsOpen(true);
				}}
			>
				{children}
			</TooltipTrigger>
			<TooltipContent
				// Prevent tooltip from closing when the trigger is pressed
				// @see https://github.com/radix-ui/primitives/issues/1077#issuecomment-1137431404
				onPointerDownOutside={(event) => {
					if (event.target === triggerRef.current) event.preventDefault();
				}}
			>
				{isCopied ? (
					<span className="flex items-center gap-1">
						Copied <RiCheckFill aria-hidden />
					</span>
				) : (
					copyLabel
				)}
			</TooltipContent>
		</Tooltip>
	);
}
