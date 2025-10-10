import { RiPriceTag3Line } from '@remixicon/react';
import { toast } from 'sonner';
import { useCommandPaletteActions } from '../../components/CommandPalette/context.tsx';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export const manageLabelsCommand = defineCommand({
	shortcut: { key: 'l', modifiers: [] },
	icon: RiPriceTag3Line,
	useAction() {
		const { setOpen } = useCommandPaletteActions();
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Manage labels...';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					const threadIds = threads.map((thread) => thread.id);
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					setOpen({ type: 'thread.label', ids: threadIds });
				},
			};
		};
	},
});

export default manageLabelsCommand;
