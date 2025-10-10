import { RiInbox2Fill } from '@remixicon/react';
import { mutate } from '@workspace/local/mutate.js';
import { toast } from 'sonner';
import { perf } from '../../lib/perf.ts';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

async function moveToPriorityAction(threads: ClientThread[]) {
	const actionId = crypto.randomUUID();
	perf.time(`[PERF] moveToPriority-${actionId}`);
	perf.log(`🎬 [PERF] moveToPriority START - ${threads.length} threads`, {
		actionId,
		threads: threads.map((t) => t.id),
	});

	try {
		const now = new Date();

		perf.time(`[PERF] moveToPriority-mutation-${actionId}`);
		await mutate.threads.bulkUpdate(
			threads.map((thread) => ({
				key: thread.id,
				changes: {
					spaceId: `inbox_${thread.data.accountId}`,
					resolvedAt: null,
					trashedAt: null,
					spammedAt: null,
					triagedAt: now,
					remindAt: null,
					reminderTriggeredAt: null,
					...(thread.category === 'junk' ? { category: null } : {}),
				},
			})),
		);
		perf.timeEnd(`[PERF] moveToPriority-mutation-${actionId}`);

		perf.timeEnd(`[PERF] moveToPriority-${actionId}`);
		perf.log(`✅ [PERF] moveToPriority COMPLETE`, { actionId });

		toast.success('Moved to Priority.');
	} catch (error) {
		perf.timeEnd(`[PERF] moveToPriority-${actionId}`);
		perf.error(`❌ [PERF] moveToPriority ERROR`, { actionId, error });
		throw error;
	}
}

export const moveToPriorityCommand = defineCommand({
	shortcut: { key: 'r', modifiers: [] },
	icon: RiInbox2Fill,
	useAction() {
		const contextThreads = useThreadsFromContext();

		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Move to Priority';
				},
				run: async (): Promise<void> => {
					const threads = inlineThreads ?? contextThreads ?? [];
					if (threads.length === 0) {
						toast.warning('No threads selected.');
						return;
					}
					moveToPriorityAction(threads);
				},
			};
		};
	},
});

export default moveToPriorityCommand;
