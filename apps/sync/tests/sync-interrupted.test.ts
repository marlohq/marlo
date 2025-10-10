import type { Account, User } from '@workspace/core/drizzle.js';
import { db, eq, inArray, message, thread } from '@workspace/core/drizzle.js';
import { consumeMessage } from '@workspace/google/mail-ingestion/ingest.js';
import type { ClientSyncState } from '@workspace/sync-data/schema.js';
import type { ServerMessage, ThreadMessage } from '@workspace/sync-data/server-messages.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { invariant } from 'es-toolkit';
import { beforeAll, describe, expect, it } from 'vitest';
import { sync } from '../src/sync.js';

describe('Full sync with interruption', () => {
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

		invariant(sync1Message1, 'sync1Message1 is undefined');
		invariant(sync1Message2, 'sync1Message2 is undefined');
		invariant(sync2Message1, 'sync2Message1 is undefined');
		invariant(sync3Message, 'sync3Message is undefined');

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

	describe('syncs', () => {
		const messages: ServerMessage[] = [];

		beforeAll(async () => {
			const accountId = account.id;
			const userId = user.id;
			const clientState: ClientSyncState = {};
			const batchSize = 1;

			let count = 0;
			for await (const message of sync({ accountId, userId, clientState, batchSize })) {
				messages.push(message);
				// Only do the first two messages. One is the initial sync, the other is the one
				// that we are going to end with.
				if (message.type === 'threads') {
					count++;
					if (count === 2) {
						break;
					}
				}
			}
		});

		it('syncs the first threads that have the same date', async () => {
			const threadMessages = messages.filter((message) => message.type === 'threads');
			expect(threadMessages.length).toBe(2);
			expect(threadMessages[1]?.updated.length).toBe(2);
			expect(threadMessages[1]?.updated[0]?.messages.length).toBe(2);
			expect(threadMessages[1]?.updated[1]?.messages.length).toBe(1);

			expect(threadMessages[1]?.version).toBeDefined();
		});

		it('can resume from the last sync', async () => {
			const newMessages: ServerMessage[] = [];
			const previousThreadMessages = messages.filter((message) => message.type === 'threads');
			const clientState: ClientSyncState = {
				Thread: {
					version: (previousThreadMessages[1] as ThreadMessage).version,
					schemaChanges: { added: [], removed: [] },
				},
			};
			const accountId = account.id;
			const userId = user.id;
			const batchSize = 1;

			for await (const message of sync({ accountId, userId, clientState, batchSize })) {
				newMessages.push(message);
				if (message.type === 'threads') {
					break;
				}
			}

			const threadMessages = newMessages.filter((message) => message.type === 'threads');
			expect(threadMessages.length).toBe(1);
			expect(threadMessages[0]?.updated.length).toBe(1);
			expect(threadMessages[0]?.updated[0]?.messages.length).toBe(1);
		});
	});
});
