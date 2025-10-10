import { RiCheckboxLine } from '@remixicon/react';
import { mutate } from '@workspace/local/mutate.js';
import { toast } from 'sonner';
import { actions } from '../../lib/actions.ts';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

async function markAsUnread(threads: ClientThread[]) {
	const threadDatas = threads.map((t) => t.data);
	await mutate.messages.bulkUpdate(threadDatas, { readAt: null });

	actions.google.sync({
		action: { id: 'unread:add' },
		remoteThreadIds: threads.map((t) => t.remoteId),
	});

	toast.success('Marked as unread.');
}

async function markAsRead(threads: ClientThread[]) {
	const threadDatas = threads.map((t) => t.data);
	const currentTimestamp = new Date();
	await mutate.messages.bulkUpdate(threadDatas, { readAt: currentTimestamp });

	actions.google.sync({
		action: { id: 'unread:remove' },
		remoteThreadIds: threadDatas.map((t) => t.remoteId),
	});

	toast.success('Marked as read.');
}

function check(threads: ClientThread[]): boolean {
	return !threads.every((thread) => thread.read);
}

export const markAsReadCommand = defineCommand({
	shortcut: { key: 'u', modifiers: [] },
	icon: RiCheckboxLine,
	useAction() {
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					const threads = inlineThreads ?? contextThreads ?? [];
					return check(threads) ? 'Mark as read' : 'Mark as unread';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					check(threads) ? markAsRead(threads) : markAsUnread(threads);
				},
			};
		};
	},
});

export default markAsReadCommand;
