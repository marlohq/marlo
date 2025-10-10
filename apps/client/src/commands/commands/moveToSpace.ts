import { RiArrowRightLine } from '@remixicon/react';
import { useCommandPaletteActions } from '../../components/CommandPalette/context.tsx';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export const moveToSpaceCommand = defineCommand({
	shortcut: { key: 'r', modifiers: ['Shift'] },
	icon: RiArrowRightLine,
	useAction() {
		const { setOpen } = useCommandPaletteActions();
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Move to...';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					const threadIds = threads.map((thread) => thread.id);
					setOpen({ type: 'thread.spaces', ids: threadIds });
				},
			};
		};
	},
});

export default moveToSpaceCommand;
