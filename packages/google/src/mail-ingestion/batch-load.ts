import { type Account, db, label, sql } from '@workspace/core/drizzle.js';
import { INBOX_LABEL_ID } from '@workspace/core/labels.ts';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createId } from '@workspace/core/util.js';
import { invariant } from 'es-toolkit';
import type { gmail_v1 } from 'googleapis';
import type { Gmail } from '../types.js';
import { decodeEntities, trimAllWhitespace } from '../util.ts';
import { listGmailLabels } from './gmail-calls.js';
import { MessageIngestionPriority, queueMailIngestion } from './ingest.js';

const logger = baseLogger.child({ namespace: 'google:batch-load' });

export async function batchLoadAll(opts: { gmail: Gmail; account: Account }) {
	await batchLoadAllMessages(opts.gmail, opts.account);
}

export async function batchLoadAllMessages(gmail: Gmail, account: Account) {
	const { userId, id: accountId } = account;

	// Sync: Get all the labels the user has access to
	logger.info({ userId: account.userId }, 'Start sync (labels)');
	await batchLoadLabels({
		gmail,
		userId,
		accountId,
	});

	// Sync: Sync your inbox first, before anything else.
	// This is the most important part of the product.
	logger.info({ userId }, 'Start sync (inbox)');
	await batchQueueMessages({
		gmail,
		userId,
		accountId,
		filter: {
			labelIds: [INBOX_LABEL_ID],
			q: process.env.NODE_ENV === 'development' ? '' : '',
		},
		metadata: (messageCount, threadCount) => {
			const recentEnough = messageCount < 1000;

			return {
				priority: recentEnough ? MessageIngestionPriority.HIGH : MessageIngestionPriority.NORMAL,
			};
		},
	});

	// Sync: Sync all of the other messages in your mailbox.
	logger.info({ userId }, 'Start sync (everything)');
	await batchQueueMessages({
		gmail,
		userId,
		accountId,
		filter: {
			includeSpamTrash: true,
			q: `-label:${INBOX_LABEL_ID}${process.env.NODE_ENV === 'development' ? '' : ''}`,
		},
		metadata: () => ({
			priority: MessageIngestionPriority.LOW,
		}),
	});
}

/** Update the list of labels a user has access to. */
export async function batchLoadLabels({
	gmail,
	userId,
	accountId,
}: {
	gmail: Gmail;
	userId: string;
	accountId: string;
}) {
	const result = await listGmailLabels(gmail);
	const labels = result.data.labels ?? [];

	// Skip system labels
	const userLabels = labels.filter((label): label is gmail_v1.Schema$Label & { id: string } => {
		return label.type === 'user' && typeof label.id === 'string';
	});

	if (userLabels.length > 0) {
		await db
			.insert(label)
			.values(
				userLabels.map((labelItem) => ({
					id: createId(),
					name: labelItem.name ?? '',
					textColor: labelItem.color?.textColor ?? null,
					backgroundColor: labelItem.color?.backgroundColor ?? null,
					type: 'user' as const,
					accountId,
					userId,
					remoteId: labelItem.id,
					createdAt: new Date(),
					updatedAt: new Date(),
				})),
			)
			.onConflictDoUpdate({
				target: [label.remoteId, label.accountId],
				set: {
					name: sql`EXCLUDED."name"`,
					textColor: sql`EXCLUDED."textColor"`,
					backgroundColor: sql`EXCLUDED."backgroundColor"`,
					updatedAt: new Date(),
				},
			});
	}
}

async function batchQueueMessages({
	gmail,
	userId,
	accountId,
	filter,
	metadata,
}: {
	gmail: Gmail;
	userId: string;
	accountId: string;
	filter: Pick<gmail_v1.Params$Resource$Users$Messages$List, 'labelIds' | 'q' | 'includeSpamTrash'>;
	metadata: (
		messageQueued: number,
		threadCount: number,
	) => {
		priority: MessageIngestionPriority;
	};
}) {
	let nextPageToken: string | null | undefined;
	let messageCount = 0;

	const differentThreadIds = new Set<string>();

	const t0 = performance.now();
	do {
		const t0 = performance.now();
		const query: gmail_v1.Params$Resource$Users$Messages$List = {
			userId: 'me',
			maxResults: 500,
			pageToken: nextPageToken ?? undefined,
			...filter,
		};
		const results = await gmail.users.messages.list(query);
		const messages = results.data.messages ?? [];

		await queueMailIngestion(
			userId,
			accountId,
			messages.map((message, i) => {
				invariant(message.id, 'Message ID is required');
				invariant(message.threadId, 'Thread ID is required');

				differentThreadIds.add(message.threadId);

				const { priority } = metadata(i + messageCount, differentThreadIds.size);

				return {
					remoteMessageId: message.id,
					remoteThreadId: message.threadId,
					priority,
				};
			}),
		);

		nextPageToken = results.data.nextPageToken;
		messageCount += messages.length;
		logger.info(
			{ userId, duration: performance.now() - t0 },
			'Queued page of message for processing',
		);
	} while (nextPageToken);

	logger.info(
		{ userId, messageCount, duration: performance.now() - t0 },
		'Queued messages for processing',
	);
}

export async function loadGmailMessageData(
	message: gmail_v1.Schema$Message,
	messageIdHeader: string,
	gmail: Gmail,
) {
	invariant(message.threadId, 'Gmail message threadId is missing');
	invariant(message.id, 'Gmail message id is missing');
	invariant(message.internalDate, 'Gmail message internalDate is missing');

	const internalDateValue = Number.parseInt(message.internalDate);
	invariant(
		!Number.isNaN(internalDateValue),
		`internalDate ${message.internalDate} is not a valid date`,
	);

	const internalDate = new Date(internalDateValue);

	return {
		id: message.id,
		remoteThreadId: message.threadId,
		remoteLabelIds: message.labelIds ?? [],
		snippet: message.snippet ? decodeEntities(trimAllWhitespace(message.snippet)) : null,
		internalDate,
	};
}
