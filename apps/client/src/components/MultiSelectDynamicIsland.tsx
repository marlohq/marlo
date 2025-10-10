import { RiCloseFill, RiMoreFill } from '@remixicon/react';
import { useQuery } from '@workspace/local/query.js';
import { Button } from '@workspace/ui';
import resolveCommand from '../commands/commands/resolve.ts';
import { cn } from '../lib/util.ts';
import { ClientThread } from '../threads/model.ts';
import { useCommandPaletteActions } from './CommandPalette/context.tsx';
import { KeyboardShortcutBadge } from './KeyboardShortcutBadge.tsx';

function DynamicIsland({ children, className }: { children: React.ReactNode; className?: string }) {
	return (
		<div className="pointer-events-none absolute bottom-6 left-0 right-0 z-50 flex items-center justify-center px-6">
			<div
				className={cn(
					'pointer-events-auto w-full max-w-screen-sm overflow-hidden rounded-md bg-white shadow-md outline outline-1 outline-neutral-900/15',
					className,
				)}
			>
				{children}
			</div>
		</div>
	);
}

export function MultiSelectDynamicIsland({
	threadIds,
	onClear,
}: {
	threadIds: string[];
	onClear: () => void;
}) {
	const { setOpen } = useCommandPaletteActions();
	const resolveAction = resolveCommand.useAction();
	const [data] = useQuery(
		(db) => db.threads.where('data.id').anyOf(threadIds).toArray(),
		[threadIds],
	);
	const threads = data?.map((item) => new ClientThread(item.data)) ?? [];
	const count = threadIds.length;
	if (count === 0) {
		return null;
	}
	return (
		<DynamicIsland>
			<div className="flex h-full w-full items-center justify-start gap-0.5 overflow-hidden px-1.5 py-1.5">
				<div className="flex items-center justify-start gap-1.5">
					<div className="flex h-7 min-w-7 shrink-0 items-center justify-center px-2">
						<div className="text-neutral-600">
							{count} selected thread{count === 1 ? '' : 's'}
						</div>
					</div>
				</div>
				<div className="flex-1 shrink" />
				<Button
					variant="ghost"
					size="sm"
					className={cn('h-7 shrink-0 gap-1.5 px-2')}
					onClick={() => {
						resolveAction(threads).run();
						onClear();
					}}
				>
					<span className="text-neutral-600">{resolveAction(threads).label()}</span>
					<KeyboardShortcutBadge shortcut={resolveCommand.shortcut} />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="flex size-7 shrink-0 items-center justify-center rounded-md p-0"
					onClick={() => setOpen({ type: 'thread', ids: threadIds })}
				>
					<RiMoreFill className="size-5" aria-hidden />
				</Button>
				<Button
					type="button"
					size="icon"
					variant="ghost"
					className="flex size-7 shrink-0 items-center justify-center rounded-md p-0"
					onClick={() => onClear()}
				>
					<RiCloseFill className="size-5" aria-hidden />
				</Button>
			</div>
		</DynamicIsland>
	);
}
