import type { Account, User } from '@workspace/core/drizzle.js';
import { db, eq, inArray, message, thread } from '@workspace/core/drizzle.js';
import { consumeMessage } from '@workspace/google/mail-ingestion/ingest.js';
import type { ClientSyncState } from '@workspace/sync-data/schema.js';
import type { ServerMessage } from '@workspace/sync-data/server-messages.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { invariant } from 'es-toolkit';
import { beforeAll, describe, expect, it } from 'vitest';
import { sync } from '../src/sync.js';

describe('Full sync', () => {
	let account: Account;
	let user: User;

	beforeAll(async () => {
		const { account: testAccount, user: testUser } = await createTestAccount();
		account = testAccount;
		user = testUser;
		const sync1Message1 = await consumeMessage(account, 'sync-1/message-1');
		const sync1Message2 = await consumeMessage(account, 'sync-1/message-2');
		const sync2Message1 = await consumeMessage(account, 'sync-2/message-1');
		const sync3Message = await consumeMessage(account, 'sync-3/message-1');

		invariant(sync1Message1, 'Sync 1 message 1 is required');
		invariant(sync1Message2, 'Sync 1 message 2 is required');
		invariant(sync2Message1, 'Sync 2 message 1 is required');
		invariant(sync3Message, 'Sync 3 message is required');

		const now = new Date();

		// Set these all to now, so they come in the same batch.
		await db
			.update(thread)
			.set({
				updatedAt: now,
			})
			.where(
				inArray(thread.id, [
					sync1Message1.threadId,
					sync1Message2.threadId,
					sync2Message1.threadId,
				]),
			);

		await db
			.update(message)
			.set({
				updatedAt: now,
			})
			.where(
				inArray(message.id, [
					sync1Message1.messageId,
					sync1Message2.messageId,
					sync2Message1.messageId,
				]),
			);

		const oneHourLater = new Date(now.getTime() + 1 * 60 * 60 * 1000);

		await db
			.update(thread)
			.set({
				updatedAt: oneHourLater,
			})
			.where(eq(thread.id, sync3Message.threadId));

		await db
			.update(message)
			.set({
				updatedAt: oneHourLater,
			})
			.where(eq(message.id, sync3Message.messageId));
	});

	it.skip('syncs accounts', async () => {
		const messages: ServerMessage[] = [];

		for await (const message of sync({
			accountId: account.id,
			userId: user.id,
			clientState: {},
			batchSize: 1,
		})) {
			messages.push(message);
		}

		const accountMessage = messages.find((message) => message.type === 'accounts');
		expect(accountMessage).toBeDefined();
		expect(accountMessage?.accounts.length).toBe(1);
		expect(accountMessage?.accounts[0]?.id).toBe(account.id);
	});

	it('initial syncs messages by lastSentAt', async () => {
		const messages: ServerMessage[] = [];

		const accountId = account.id;
		const userId = user.id;
		const clientState: ClientSyncState = {};
		const batchSize = 5;

		for await (const message of sync({ accountId, userId, clientState, batchSize })) {
			messages.push(message);
		}

		const threadMessages = messages.filter((message) => message.type === 'threads');
		expect(threadMessages.length).toBe(2);
		expect(threadMessages[0]?.updated.length).toBe(3);
		// Verify threads are sorted by lastSentAt in descending order
		const threads = threadMessages[0]?.updated;
		for (let i = 0; i < (threads?.length ?? 0) - 1; i++) {
			const lastSentAt1 = threads?.[i]?.lastSentAt;
			const lastSentAt2 = threads?.[i + 1]?.lastSentAt;
			if (lastSentAt1 == null || lastSentAt2 == null) {
				expect(false).toBe(true);
				return;
			}
			expect(lastSentAt1 >= lastSentAt2).toBe(true);
		}
	});

	it('syncs all threads and messages', async () => {
		const messages: ServerMessage[] = [];

		const accountId = account.id;
		const userId = user.id;
		const clientState: ClientSyncState = {};
		const batchSize = 1;

		for await (const message of sync({ accountId, userId, clientState, batchSize })) {
			messages.push(message);
		}

		const threadMessages = messages.filter((message) => message.type === 'threads');
		expect(threadMessages.length).toBe(3);
		expect(threadMessages[1]?.updated.length).toBe(2);
		expect(threadMessages[1]?.updated[0]?.messages.length).toBe(2);
		expect(threadMessages[1]?.updated[1]?.messages.length).toBe(1);
		expect(threadMessages[2]?.updated.length).toBe(1);
		expect(threadMessages[2]?.updated[0]?.messages.length).toBe(1);
	});
});
