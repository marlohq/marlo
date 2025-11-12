import { createId } from '@workspace/core/util.js';
import { getDatabase } from '@workspace/local/database.js';
import { mutate } from '@workspace/local/mutate.js';
import type {
	DraftData,
	MessageData,
	MessageLabelData,
	ThreadData,
} from '@workspace/sync-data/data.ts';
import { actions } from '../lib/actions.ts';
import { perf } from '../lib/perf.ts';
import type { ClientThread } from './model.ts';

export function createThread(thread: ThreadData) {
	return mutate.threads.create(thread);
}

export function deleteThread(threadId: string) {
	return mutate.threads.delete(threadId);
}

export function createMessage(threadId: string, message: MessageData) {
	return mutate.messages.create(threadId, message);
}

export function deleteMessage(threadId: string, messageId: string) {
	return mutate.messages.delete(threadId, messageId);
}

export function updateMessage(threadId: string, messageId: string, changes: Partial<MessageData>) {
	return mutate.messages.update(threadId, messageId, changes);
}

function createDraft(draft: DraftData) {
	return mutate.drafts.create(draft);
}

export async function setThreadReadStatus(thread: ThreadData | ClientThread, read: boolean) {
	const currentTimestamp = new Date().toISOString();
	const messages = thread.messages ?? [];
	let needsSync = false;

	for (const message of messages) {
		// Ignore unsent messages
		if (message.remoteId.startsWith('ZZ')) continue;
		// Ignore deleted messages
		if (message.deletedAt) continue;

		if ((read && !message.readAt) || (!read && message.readAt)) {
			mutate.messages.update(message.threadId, message.id, {
				readAt: read ? currentTimestamp : null,
			});
			needsSync = true;
		}
	}

	if (needsSync) {
		await actions.google.sync({
			action: { id: read ? 'unread:remove' : 'unread:add' },
			remoteThreadIds: [thread.remoteId],
		});
	}
}

export async function setThreadSpamStatus(threads: ThreadData[], isSpam: boolean) {
	const date = new Date().toISOString();
	await mutate.threads.bulkUpdate(
		threads.map((thread) => ({
			key: thread.id,
			changes: {
				...(isSpam ? { resolvedAt: date } : {}),
				spammedAt: isSpam ? date : null,
			},
		})),
	);

	await actions.google.sync({
		action: { id: isSpam ? 'spam:add' : 'spam:remove' },
		remoteThreadIds: threads.map((t) => t.remoteId),
	});
}

export async function setThreadSafeStatus(thread: ThreadData, isSafe: boolean) {
	const date = new Date().toISOString();
	await mutate.threads.update(thread.id, {
		markedSafeAt: isSafe ? date : null,
	});
}

export async function setThreadTrashedStatus(threads: ThreadData[], trash: boolean) {
	const date = new Date().toISOString();
	await mutate.threads.bulkUpdate(
		threads.map((thread) => ({
			key: thread.id,
			changes: {
				resolvedAt: trash ? date : null,
				trashedAt: trash ? date : null,
			},
		})),
	);
	await actions.google.sync({
		action: { id: trash ? 'trash:add' : 'trash:remove' },
		remoteThreadIds: threads.map((t) => t.remoteId),
	});
}

export async function addLabelsToThread(thread: ClientThread, labelId: string) {
	const db = getDatabase();

	for (const message of thread.messages) {
		db.labels
			.where('data.id')
			.equals(labelId)
			.first()
			.then((label) => {
				if (!label) return;

				const newLabel: MessageLabelData = {
					id: createId(),
					messageId: message.id,
					labelId: label.data.id,
					label: label.data,
				};

				message.messageLabels.push(newLabel);
				mutate.messages.update(thread.id, message.id, {
					messageLabels: message.messageLabels,
				});
			});
	}

	actions.google.sync({
		action: { id: 'label:add', labelId },
		remoteThreadIds: [thread.remoteId],
	});
}

export async function removeLabelsFromThread(thread: ThreadData | ClientThread, labelId: string) {
	for (const message of thread.messages) {
		mutate.messages.update(message.threadId, message.id, {
			messageLabels: message.messageLabels.filter((l) => l.labelId !== labelId),
		});
	}

	actions.google.sync({
		action: { id: 'label:remove', labelId },
		remoteThreadIds: [thread.remoteId],
	});
}

export async function setResolved(threads: ThreadData[], isResolved: boolean) {
	const actionId = crypto.randomUUID();
	perf.time(`[PERF] setResolved-${actionId}`);
	perf.log(`🎬 [PERF] setResolved START - ${threads.length} threads`, {
		actionId,
		isResolved,
		threads: threads.map((t) => t.id),
	});

	const now = new Date().toISOString();
	if (threads.length === 0) {
		perf.log(`⚠️ [PERF] setResolved SKIPPED - no threads`, { actionId });
		return;
	}

	try {
		perf.time(`[PERF] setResolved-mutation-${actionId}`);
		if (threads.length === 1) {
			// NOTE(fks): This is faster than bulkUpdate at the moment.
			// Remove this workaround once bulkUpdate slowdown is fixed.
			// biome-ignore lint/style/noNonNullAssertion: Allowed here.
			await mutate.threads.update(threads[0]!.id, {
				resolvedAt: isResolved ? now : null,
				trashedAt: isResolved ? undefined : null,
				spammedAt: isResolved ? undefined : null,
				triagedAt: now,
				remindAt: null,
				reminderTriggeredAt: null,
			});
		} else {
			await mutate.threads.bulkUpdate(
				threads.map((thread) => ({
					key: thread.id,
					changes: {
						resolvedAt: isResolved ? now : null,
						trashedAt: isResolved ? undefined : null,
						spammedAt: isResolved ? undefined : null,
						triagedAt: now,
						remindAt: null,
						reminderTriggeredAt: null,
					},
				})),
			);
		}
		perf.timeEnd(`[PERF] setResolved-mutation-${actionId}`);

		perf.time(`[PERF] setResolved-google-sync-${actionId}`);
		await actions.google.sync({
			action: { id: isResolved ? 'resolve:add' : 'resolve:remove' },
			remoteThreadIds: threads.map((t) => t.remoteId),
		});
		perf.timeEnd(`[PERF] setResolved-google-sync-${actionId}`);

		perf.timeEnd(`[PERF] setResolved-${actionId}`);
		perf.log(`✅ [PERF] setResolved COMPLETE`, { actionId });
	} catch (error) {
		perf.timeEnd(`[PERF] setResolved-${actionId}`);
		perf.error(`❌ [PERF] setResolved ERROR`, { actionId, error });
		throw error;
	}
}

export async function setStarred(threads: ThreadData[], isStarred: boolean) {
	const now = new Date().toISOString();
	if (threads.length === 0) {
		return;
	}

	if (threads.length === 1) {
		// biome-ignore lint/style/noNonNullAssertion: Allowed here.
		await mutate.threads.update(threads[0]!.id, {
			starredAt: isStarred ? now : null,
		});
	} else {
		await mutate.threads.bulkUpdate(
			threads.map((thread) => ({
				key: thread.id,
				changes: {
					starredAt: isStarred ? now : null,
				},
			})),
		);
	}

	await actions.google.sync({
		action: { id: isStarred ? 'star:add' : 'star:remove' },
		remoteThreadIds: threads.map((t) => t.remoteId),
	});
}
