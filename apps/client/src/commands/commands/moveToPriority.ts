import { RiInbox2Fill } from '@remixicon/react';
import { mutate } from '@workspace/local/mutate.js';
import type { SyncAction } from '@workspace/core/remote-sync.js';
import { toast } from 'sonner';
import { perf } from '../../lib/perf.ts';
import { actions } from '../../lib/actions.ts';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

function determineSyncAction(threads: ClientThread[]): SyncAction | undefined {
	if (threads.some((t) => t.trashedAt)) {
		return { id: 'trash:remove' as const };
	}
	if (threads.some((t) => t.spammedAt)) {
		return { id: 'spam:remove' as const };
	}
	return undefined;
}

async function moveToPriorityAction(threads: ClientThread[], syncAction?: SyncAction) {
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

		if (syncAction) {
			perf.time(`[PERF] moveToPriority-sync-${actionId}`);
			await actions.google.sync({
				action: syncAction,
				remoteThreadIds: threads.map((t) => t.remoteId),
			});
			perf.timeEnd(`[PERF] moveToPriority-sync-${actionId}`);
		}

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
					const syncAction = determineSyncAction(threads);
					moveToPriorityAction(threads, syncAction);
				},
			};
		};
	},
});

export default moveToPriorityCommand;
