import { RiDeleteBinLine } from '@remixicon/react';
import { toast } from 'sonner';
import type { ClientThread } from '../../threads/model.ts';
import { setThreadTrashedStatus } from '../../threads/mutations.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

function trashThreads(threads: ClientThread[]) {
	setThreadTrashedStatus(
		threads.map((t) => t.data),
		true,
	);
	toast.success('Moved to trash.');
}

function restoreThreads(threads: ClientThread[]) {
	setThreadTrashedStatus(
		threads.map((t) => t.data),
		false,
	);
	toast.success('Moved back to inbox.');
}

function check(threads: ClientThread[]): boolean {
	return !threads.every((thread) => thread.trashedAt);
}

export const trashCommand = defineCommand({
	shortcut: { key: 't', modifiers: [] },
	icon: RiDeleteBinLine,
	useAction() {
		const contextThreads = useThreadsFromContext();

		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					const threads = inlineThreads ?? contextThreads ?? [];
					return check(threads) ? 'Delete' : 'Restore';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					if (check(threads)) {
						trashThreads(threads);
					} else {
						restoreThreads(threads);
					}
				},
			};
		};
	},
});

export default trashCommand;
