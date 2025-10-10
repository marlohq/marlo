import { type Account, account as accountTable, db, eq } from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger } from '@workspace/core/logger.js';
import { createQueue } from '@workspace/core/queue-exports.ts';
import { connection } from '@workspace/core/redis-connection.js';
import { invariant } from 'es-toolkit';

import { watchAccount } from '../account.ts';
import type { Gmail } from '../types.ts';
import { batchLoadAllMessages } from './batch-load.ts';
import { listGmailHistory } from './gmail-calls.ts';
import { consumeLabelChanges, MessageIngestionPriority, queueMailIngestion } from './ingest.ts';
import { deleteMessage } from './message.ts';

export enum UpdateHistoryJobStep {
	GatheringHistory = 0,
	WaitingForSubtasks = 1,
	Finished = 2,
}

export interface UpdateHistoryJobData {
	emailAddress: string;
	historyId?: string;
	accountId?: string;
	step: UpdateHistoryJobStep;
}

export const historyUpdateQueue = createQueue<UpdateHistoryJobData>('history-update', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		removeOnComplete: 200,
		removeOnFail: 250,
	},
});

export async function queueHistoryRefresh(emailAddress: string) {
	await historyUpdateQueue.add(
		'history-update',
		{
			emailAddress,
			step: UpdateHistoryJobStep.GatheringHistory,
		},
		{
			group: {
				id: emailAddress,
			},
		},
	);
}

export async function consumeHistory(gmail: Gmail, startHistoryId: string, account: Account) {
	logger.info({ from: startHistoryId }, 'History sync start');

	let nextPageToken: string | null | undefined;
	let lastHistoryId = startHistoryId;

	const addedMessageIds: Set<string> = new Set();
	let addedMessages: { messageId: string; threadId: string }[] = [];

	const removedMessageIds: Set<string> = new Set();
	let removedMessages: { messageId: string; threadId: string }[] = [];

	let messageLabelsChanges = new Map<
		string,
		{ threadId: string; labelsAdded: string[]; labelsRemoved: string[] }
	>();

	// Get the history details
	do {
		let history;
		try {
			history = await listGmailHistory(gmail, lastHistoryId, nextPageToken ?? undefined);
		} catch (e) {
			logger.warn(
				{ error: e },
				'Google: history request failed, historyId might be too old. Doing full sync.',
			);
			await queueAllMessages();
			return;
		}

		// You're supposed to be able to check if you got a 404 by checking the status, but `gmail.users.history.list` actually throws an error if it gets a 404.
		// Checking here too just in case, but it's probably not necessary.
		if (history.status === 404) {
			logger.warn('Google: history not found, historyId might be too old. Doing full sync.');
			await queueAllMessages();
			return;
		}

		invariant(history.data.historyId, 'Google: historyId is required');

		for (const record of history.data.history ?? []) {
			if (record.messagesAdded) {
				for (const message of record.messagesAdded) {
					if (!message.message?.id || !message.message.threadId) continue;

					addedMessageIds.add(message.message.id);

					addedMessages.push({
						messageId: message.message.id,
						threadId: message.message.threadId,
					});
				}
			}

			if (record.messagesDeleted) {
				for (const message of record.messagesDeleted) {
					if (!message.message?.id || !message.message.threadId) continue;

					removedMessageIds.add(message.message.id);

					removedMessages.push({
						messageId: message.message.id,
						threadId: message.message.threadId,
					});
				}
			}

			if (record.labelsAdded) {
				for (const item of record.labelsAdded) {
					const { id, threadId } = item.message ?? {};
					const { labelIds } = item;
					if (!id || !threadId || !labelIds) continue;

					const existing = messageLabelsChanges.get(id) ?? { labelsAdded: [], labelsRemoved: [] };
					messageLabelsChanges.set(id, {
						...existing,
						threadId,
						labelsAdded: [...existing.labelsAdded, ...labelIds],
					});
				}
			}

			if (record.labelsRemoved) {
				for (const item of record.labelsRemoved) {
					const { id, threadId } = item.message ?? {};
					const { labelIds } = item;
					if (!id || !threadId || !labelIds) continue;

					const existing = messageLabelsChanges.get(id) ?? { labelsAdded: [], labelsRemoved: [] };
					messageLabelsChanges.set(id, {
						...existing,
						threadId,
						labelsRemoved: [...existing.labelsRemoved, ...labelIds],
					});
				}
			}
		}

		nextPageToken = history.data.nextPageToken;
		lastHistoryId = history.data.historyId;
	} while (nextPageToken);

	// Calculate messages that were truly added (added but not subsequently removed)
	const netAddedMessageIds = new Set(
		[...addedMessageIds].filter((messageId) => !removedMessageIds.has(messageId)),
	);

	// Filter out operations on messages that were deleted in this history update
	// or that represent temporary messages (added then removed in the same update)
	addedMessages = addedMessages.filter((message) => netAddedMessageIds.has(message.messageId));

	messageLabelsChanges = new Map(
		[...messageLabelsChanges].filter(([messageId]) => !removedMessageIds.has(messageId)),
	);

	// Remove messages that were added and removed in the same history update
	// (we never actually ingested these messages, so no point in trying to delete them from our DB)
	removedMessages = removedMessages.filter((message) => !netAddedMessageIds.has(message.messageId));

	return {
		addedMessages,
		removedMessages,
		messageLabelsChanges: Object.fromEntries(messageLabelsChanges),
		historyId: lastHistoryId,
	};

	async function queueAllMessages() {
		const accountWatch = await watchAccount(gmail, account.id);

		await db
			.update(accountTable)
			.set({
				historyId: accountWatch.historyId,
				watchExpiration: accountWatch.expiration,
			})
			.where(eq(accountTable.id, account.id));

		// Queue all the data to be loaded in the background
		batchLoadAllMessages(gmail, account).catch((error) => {
			captureException({ error }, 'batchLoadAllMessages() failed');
		});
	}
}

export async function consumeHistoryMessageChanges(
	accountId: string,
	userId: string,
	addedMessages?: { messageId: string; threadId: string }[],
	removedMessages?: { messageId: string; threadId: string }[],
): Promise<void> {
	if (addedMessages) {
		await queueMailIngestion(
			userId,
			accountId,
			addedMessages.map(({ messageId, threadId }) => {
				return {
					remoteMessageId: messageId,
					remoteThreadId: threadId,
					priority: MessageIngestionPriority.HIGH,
				};
			}),
		);
	}

	if (removedMessages) {
		for (const { messageId, threadId } of removedMessages) {
			await deleteMessage({
				remoteMessageId: messageId,
				remoteThreadId: threadId,
				accountId,
				userId,
			});
		}
	}
}

export async function consumeHistoryLabelChanges(
	accountId: string,
	userId: string,
	changes: Record<
		string,
		{
			threadId: string;
			labelsAdded: string[];
			labelsRemoved: string[];
		}
	>,
): Promise<void> {
	for (const [messageId, { threadId, labelsAdded, labelsRemoved }] of Object.entries(changes)) {
		await consumeLabelChanges({
			accountId,
			userId,
			remoteMessageId: messageId,
			threadId: threadId,
			addedLabelIds: labelsAdded,
			removedLabelIds: labelsRemoved,
		});
	}
}
