import type { Account, User } from '@workspace/core/drizzle.js';
import {
	and,
	db,
	eq,
	label as labelTable,
	message as messageTable,
} from '@workspace/core/drizzle.js';
import type { Job } from '@workspace/core/queue-exports.js';
import { mailProcessQueue } from '@workspace/core/queues.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { invariant } from 'es-toolkit';
import type { gmail_v1 } from 'googleapis';
import { beforeAll, describe, expect, it } from 'vitest';
import {
	consumeHistory,
	consumeHistoryLabelChanges,
	consumeHistoryMessageChanges,
} from '../src/mail-ingestion/history.ts';
import { consumeMessage } from '../src/mail-ingestion/ingest.ts';
import { getGmailClientForAccount } from '../src/request-client.ts';

describe('History', () => {
	let account: Account;
	let user: User;
	let gmail: gmail_v1.Gmail;

	beforeAll(async () => {
		const { account: testAccount, user: testUser } = await createTestAccount();

		const { client } = await getGmailClientForAccount(account);
		invariant(client, 'Gmail client not found');
		account = testAccount;
		user = testUser;
		gmail = client;
	});

	it('can queue messages through history', async () => {
		const messageId = 'will-get-added-by-history';
		const history = await consumeHistory(gmail, 'add-message', account);
		expect(history).toBeDefined();

		await consumeHistoryMessageChanges(
			account.id,
			user.id,
			history?.addedMessages,
			history?.removedMessages,
		);

		// Job might be in any of the good states, so we just check that it's somewhere in the queue and has the proper remote ID
		if ('getGroupJobs' in mailProcessQueue) {
			const queuedMessages = await mailProcessQueue.getGroupJobs(account.id);
			expect(queuedMessages).toHaveLength(1);
			expect(queuedMessages?.[0]?.data.remoteMessageId).toBe(messageId);
		} else {
			const queuedMessages = await mailProcessQueue.getJobs(['waiting', 'active', 'delayed']);
			const matchingJob = queuedMessages.find((job: Job) => job.data.remoteMessageId === messageId);
			expect(matchingJob).toBeDefined();
		}
	});

	it('can delete messages through history', async () => {
		const messageId = 'will-get-removed-by-history';
		const message = await consumeMessage(account, messageId);

		expect(message).toBeDefined();

		invariant(message?.messageId, 'Message ID is required');
		const dbMessage = await db
			.select()
			.from(messageTable)
			.where(eq(messageTable.id, message.messageId))
			.limit(1);

		expect(dbMessage[0]).toBeDefined();

		const history = await consumeHistory(gmail, 'delete-message', account);
		expect(history).toBeDefined();

		await consumeHistoryMessageChanges(
			account.id,
			user.id,
			history?.addedMessages,
			history?.removedMessages,
		);

		const deletedMessage = await db
			.select()
			.from(messageTable)
			.where(and(eq(messageTable.accountId, account.id), eq(messageTable.remoteId, messageId)))
			.limit(1);

		expect(deletedMessage).toHaveLength(0);
	});

	it('can add and remove labels through history', async () => {
		const messageId = 'will-get-labels';
		const message = await consumeMessage(account, messageId);

		expect(message).toBeDefined();

		invariant(message?.messageId, 'Message ID is required');
		const dbMessage = await db.query.message.findFirst({
			where: eq(messageTable.id, message.messageId),
			with: {
				messageLabels: true,
			},
		});

		expect(dbMessage).toBeDefined();
		expect(dbMessage?.threadId).toBeDefined();
		expect(dbMessage?.messageLabels).toBeDefined();
		expect(dbMessage?.messageLabels).toHaveLength(0);

		const [someLabel] = await db
			.insert(labelTable)
			.values({
				id: `label-${Date.now()}`,
				accountId: account.id,
				remoteId: 'some-label',
				name: 'Some Label',
				type: 'user',
				userId: account.userId,
			})
			.returning();

		expect(someLabel).toBeDefined();
		invariant(someLabel, 'Label creation failed');
		invariant(dbMessage?.threadId, 'Thread ID is required');

		const addLabelHistory = await consumeHistory(gmail, 'label-added', account);
		expect(addLabelHistory).toBeDefined();

		invariant(addLabelHistory?.messageLabelsChanges, 'Message labels changes are required');

		await consumeHistoryLabelChanges(account.id, user.id, addLabelHistory?.messageLabelsChanges);

		// Check if label was added (might not be reliable without mocking)
		const updatedMessage = await db.query.message.findFirst({
			where: eq(messageTable.id, dbMessage.id),
			with: {
				messageLabels: true,
			},
		});

		expect(updatedMessage).toBeDefined();
		expect(updatedMessage?.messageLabels).toBeDefined();
		expect(updatedMessage?.messageLabels).toHaveLength(1);
		expect(updatedMessage?.messageLabels?.[0]?.labelId).toBe(someLabel.id);

		// Delete the label with a new history ID
		const deleteLabelHistory = await consumeHistory(gmail, 'label-removed', account);
		expect(deleteLabelHistory).toBeDefined();

		invariant(deleteLabelHistory?.messageLabelsChanges, 'Message labels changes are required');

		await consumeHistoryLabelChanges(account.id, user.id, deleteLabelHistory?.messageLabelsChanges);

		// Check if label was removed
		const finalMessage = await db.query.message.findFirst({
			where: eq(messageTable.id, dbMessage.id),
			with: {
				messageLabels: true,
			},
		});

		expect(finalMessage).toBeDefined();
		expect(finalMessage?.messageLabels).toBeDefined();
		expect(finalMessage?.messageLabels).toHaveLength(0);
	});

	it('skips draft messages during ingestion', async () => {
		// Attempt to consume a draft message
		const draftMessageId = 'draft';
		const result = await consumeMessage(account, draftMessageId);

		// Should return undefined/null since drafts are skipped
		expect(result).toBeUndefined();

		// Verify no message was created in the database
		const dbMessage = await db.query.message.findFirst({
			where: eq(messageTable.remoteId, draftMessageId),
		});

		expect(dbMessage).toBeUndefined();
	});
});
