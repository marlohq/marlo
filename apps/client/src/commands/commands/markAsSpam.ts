import { RiSpam2Fill } from '@remixicon/react';
import { toast } from 'sonner';
import type { ClientThread } from '../../threads/model.ts';
import { setThreadSpamStatus } from '../../threads/mutations.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

function markAsSpam(threads: ClientThread[]) {
	setThreadSpamStatus(
		threads.map((t) => t.data),
		true,
	);
	toast.success('Marked as spam.');
}

function markAsNotSpam(threads: ClientThread[]) {
	setThreadSpamStatus(
		threads.map((t) => t.data),
		false,
	);
	toast.success('Marked as not spam.');
}

function check(threads: ClientThread[]): boolean {
	return !threads.every((thread) => thread.spammedAt);
}

export const markAsSpamCommand = defineCommand({
	shortcut: { key: 'm', modifiers: [] },
	icon: RiSpam2Fill,
	useAction() {
		const contextThreads = useThreadsFromContext();

		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					const threads = inlineThreads ?? contextThreads ?? [];
					return check(threads) ? 'Mark as spam' : 'Unmark as spam';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					if (check(threads)) {
						markAsSpam(threads);
					} else {
						markAsNotSpam(threads);
					}
				},
			};
		};
	},
});

export default markAsSpamCommand;
