import { type KeyboardModifier, mapModifier } from '../commands/util.ts';
import { cn } from '../lib/util.ts';

export function KeyboardShortcutBadge({
	shortcut,
	className,
}: {
	shortcut: { key: string; modifiers?: KeyboardModifier[] };
	className?: string;
}) {
	const modifierLabels = shortcut.modifiers?.map(mapModifier).map((modifier) => {
		switch (modifier) {
			case 'Meta':
				return (
					<span key="meta" className="w-3 text-center text-lg">
						⌘
					</span>
				);
			case 'Control':
				return <span key="control">Ctrl</span>;
			case 'Alt':
				return <span key="alt">Alt</span>;
			case 'Shift':
				return (
					<span key="shift" className="w-3 text-center font-[sans-serif]">
						⇧
					</span>
				);
		}
	});
	return (
		<div
			className={cn(
				'flex h-5 items-center justify-center gap-1 rounded bg-neutral-700/15 px-1.5 font-mono text-xs uppercase text-neutral-600',
				className,
			)}
		>
			{modifierLabels}
			<span>{shortcut.key.toUpperCase()}</span>
		</div>
	);
}
