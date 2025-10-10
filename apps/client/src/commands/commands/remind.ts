import { RiTimerFlashLine } from '@remixicon/react';
import { toast } from 'sonner';
import { useCommandPaletteActions } from '../../components/CommandPalette/context.tsx';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export const remindCommand = defineCommand({
	shortcut: { key: 'h', modifiers: [] },
	icon: RiTimerFlashLine,
	useAction() {
		const { setOpen } = useCommandPaletteActions();
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					const threads = inlineThreads ?? contextThreads ?? [];
					return 'Set Reminder';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					const threadIds = threads.map((thread) => thread.id);
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					setOpen({ type: 'thread.remind', ids: threadIds });
				},
			};
		};
	},
});

export default remindCommand;
