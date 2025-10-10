import type { Account } from '@workspace/core/drizzle.js';
import { and, db, eq, exists, message, messageRecipient, thread } from '@workspace/core/drizzle.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { consumeMessage } from '../src/mail-ingestion/ingest.ts';

describe('Ingest', () => {
	let account: Account;

	beforeAll(async () => {
		const { account: testAccount } = await createTestAccount('ingest@marlo.so');
		account = testAccount;
	});

	it('can consume a message', async () => {
		const messageId = 'basic';
		const messageResult = await consumeMessage(account, messageId);

		expect(messageResult).toBeDefined();
		if (!messageResult) return;

		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, messageResult.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
		expect(dbMessage?.remoteId).toBe(messageId);
	});

	it('properly sets resolvedAt for trash emails for new threads', async () => {
		const trashMessageId = 'trash';
		const trashMessage = await consumeMessage(account, trashMessageId);

		expect(trashMessage).toBeDefined();
		if (!trashMessage) return;

		const dbTrashMessageThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(and(eq(message.id, trashMessage.messageId), eq(message.threadId, thread.id))),
				),
			)
			.then((rows) => rows[0] || null);

		expect(dbTrashMessageThread).toBeDefined();
		expect(dbTrashMessageThread?.resolvedAt).not.toBeNull();
	});

	it('properly sets resolvedAt for spam emails for new threads', async () => {
		const spamMessageId = 'spam';
		const spamMessage = await consumeMessage(account, spamMessageId);

		expect(spamMessage).toBeDefined();
		if (!spamMessage) return;

		const dbSpamMessageThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(and(eq(message.id, spamMessage.messageId), eq(message.threadId, thread.id))),
				),
			)
			.then((rows) => rows[0] || null);

		expect(dbSpamMessageThread).toBeDefined();
		expect(dbSpamMessageThread?.resolvedAt).not.toBeNull();
	});

	it('skips emails from ignored list', async () => {
		const ignoredMessageId = 'ignored';
		const ignoredMessage = await consumeMessage(account, ignoredMessageId);

		expect(ignoredMessage).toBeUndefined();

		const dbIgnoredMessage = await db
			.select()
			.from(message)
			.where(and(eq(message.accountId, account.id), eq(message.remoteId, ignoredMessageId)))
			.then((rows) => rows[0] || null);

		expect(dbIgnoredMessage).toBeNull();
	});

	it('can handle emails with null bytes in various fields', async () => {
		const nullBytesMessageId = 'null-bytes';
		const nullBytesMessage = await consumeMessage(account, nullBytesMessageId);

		expect(nullBytesMessage).toBeDefined();
		if (!nullBytesMessage) return;

		const dbNullBytesMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, nullBytesMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbNullBytesMessage).toBeDefined();
		expect(dbNullBytesMessage?.remoteId).toBe(nullBytesMessageId);
	});

	it('can handle emails with no from email', async () => {
		const noFromEmailMessageId = 'no-from-email';
		const noFromEmailMessage = await consumeMessage(account, noFromEmailMessageId);

		expect(noFromEmailMessage).toBeDefined();
		if (!noFromEmailMessage) return;

		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, noFromEmailMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
		expect(dbMessage?.senderEmail).toBe('');
	});

	it('can handle emails missing the Message-Id header', async () => {
		const noMessageIdMessageId = 'no-message-id';
		const noMessageIdMessage = await consumeMessage(account, noMessageIdMessageId);

		expect(noMessageIdMessage).toBeDefined();
		if (!noMessageIdMessage) return;

		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, noMessageIdMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
	});

	it('can handle emails with corrupted content-header types', async () => {
		const corruptedMessageId = 'corrupted-content-type';
		const corruptedMessage = await consumeMessage(account, corruptedMessageId);

		expect(corruptedMessage).toBeDefined();
		if (!corruptedMessage) return;

		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, corruptedMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
	});

	it('can handle emails with multiple recipients', async () => {
		const multiRecipientMessageId = 'recipients';
		const multiRecipientMessage = await consumeMessage(account, multiRecipientMessageId);
		expect(multiRecipientMessage).toBeDefined();
		if (!multiRecipientMessage) return;

		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, multiRecipientMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
		if (!dbMessage) return;

		const recipients = await db
			.select()
			.from(messageRecipient)
			.where(eq(messageRecipient.messageId, dbMessage.id));

		const to = recipients.filter((r) => r.type === 'TO');
		const cc = recipients.filter((r) => r.type === 'CC');
		const bcc = recipients.filter((r) => r.type === 'BCC');

		expect(to).toHaveLength(2);
		expect(cc).toHaveLength(2);
		expect(bcc).toHaveLength(2);
	});

	it('can handle emails with nested tables in HTML content', async () => {
		// This tests the sanitization of nested table structures in HTML emails
		const nestedTableMessageId = 'nested-table-test';
		const nestedTableMessage = await consumeMessage(account, nestedTableMessageId);

		expect(nestedTableMessage).toBeDefined();
		if (!nestedTableMessage) return;

		// Verify the message was stored in database
		const dbMessage = await db
			.select()
			.from(message)
			.where(eq(message.id, nestedTableMessage.messageId))
			.then((rows) => rows[0] || null);

		expect(dbMessage).toBeDefined();
		expect(dbMessage?.remoteId).toBe(nestedTableMessageId);

		// Verify HTML content was properly sanitized
		expect(dbMessage?.contentHtml).toBeDefined();

		// Check that nested tables are handled without breaking the structure
		// The email should still contain table elements after sanitization
		if (dbMessage?.contentHtml) {
			// Ensure the content isn't completely stripped
			expect(dbMessage.contentHtml.length).toBeGreaterThan(0);
			expect(dbMessage.contentHtml.includes('<table')).toBe(true);

			// Check for the specific price that should be in a <td>
			expect(dbMessage.contentHtml.includes('$2,803.00')).toBe(true);
		}

		// Verify text content is preserved
		expect(dbMessage?.contentText).toBeDefined();
		if (dbMessage?.contentText) {
			expect(dbMessage.contentText.length).toBeGreaterThan(0);
		}

		// Check that the email subject is preserved
		expect(dbMessage?.subject).toContain('Nested Table Test');
	});

	it('keeps thread in inbox as long as any message has the INBOX label', async () => {
		// 1. Ingest a message with the INBOX label
		const inboxMessageId = 'updates/inbox';
		const inboxMessage = await consumeMessage(account, inboxMessageId);
		expect(inboxMessage).toBeDefined();
		if (!inboxMessage) return;

		// After first message, thread should be unresolved
		let dbThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(
							and(
								eq(message.threadId, thread.id),
								eq(message.accountId, account.id),
								eq(message.remoteId, inboxMessageId),
							),
						),
				),
			)
			.then((rows) => rows[0] || null);
		expect(dbThread).toBeDefined();
		expect(dbThread?.resolvedAt).toBeNull();

		// 2. Ingest a message in the same thread without the INBOX label
		const noInboxMessageId = 'updates/no-inbox';
		const noInboxMessage = await consumeMessage(account, noInboxMessageId);
		expect(noInboxMessage).toBeDefined();
		if (!noInboxMessage) return;

		// After second message, thread should still be unresolved
		dbThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(
							and(
								eq(message.threadId, thread.id),
								eq(message.accountId, account.id),
								eq(message.remoteId, inboxMessageId),
							),
						),
				),
			)
			.then((rows) => rows[0] || null);
		expect(dbThread).toBeDefined();
		expect(dbThread?.resolvedAt).toBeNull();

		// 3. Ingest another message in the same thread with the INBOX label
		const anotherInboxMessageId = 'updates/another-inbox';
		const anotherInboxMessage = await consumeMessage(account, anotherInboxMessageId);
		expect(anotherInboxMessage).toBeDefined();
		if (!anotherInboxMessage) return;

		// After third message, thread should still be unresolved
		dbThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(
							and(
								eq(message.threadId, thread.id),
								eq(message.accountId, account.id),
								eq(message.remoteId, inboxMessageId),
							),
						),
				),
			)
			.then((rows) => rows[0] || null);
		expect(dbThread).toBeDefined();
		expect(dbThread?.resolvedAt).toBeNull();
	});

	it('lastSentAt reflects the most recent message regardless of ingestion order', async () => {
		// Ingest messages in wrong order (newest first, then oldest, then middle)
		// This simulates the real-world scenario where Gmail API returns messages newest-first
		// and workers may process them out of order
		await consumeMessage(account, 'last-sent-at-test/message3'); // Feb 10 (newest)
		await consumeMessage(account, 'last-sent-at-test/message1'); // Feb 1 (oldest)
		await consumeMessage(account, 'last-sent-at-test/message2'); // Feb 5 (middle)

		// Fetch the thread
		const dbThread = await db
			.select()
			.from(thread)
			.where(
				exists(
					db
						.select()
						.from(message)
						.where(
							and(
								eq(message.threadId, thread.id),
								eq(message.accountId, account.id),
								eq(message.remoteId, 'last-sent-at-test/message3'),
							),
						),
				),
			)
			.then((rows) => rows[0] || null);

		expect(dbThread).toBeDefined();

		// lastSentAt should be Feb 10 (the newest message), not Feb 5 (the last ingested)
		// This verifies that GREATEST() is working correctly
		const expectedDate = new Date('2025-02-10T09:15:00.000Z');
		expect(dbThread?.lastSentAt?.getTime()).toBe(expectedDate.getTime());
	});
});
