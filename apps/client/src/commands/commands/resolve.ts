import { RiCheckDoubleLine } from '@remixicon/react';
import { toast } from 'sonner';
import type { ClientThread } from '../../threads/model.ts';
import { setResolved } from '../../threads/mutations.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

function resolveAction(threads: ClientThread[]) {
	setResolved(
		threads.map((t) => t.data),
		true,
	);
	toast.success('Resolved.');
}

export const resolveCommand = defineCommand({
	shortcut: { key: 'e', modifiers: [] },
	icon: RiCheckDoubleLine,
	useAction() {
		const contextThreads = useThreadsFromContext();

		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Resolve';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					resolveAction(threads);
				},
			};
		};
	},
});

export default resolveCommand;
