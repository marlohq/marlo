import {
	account,
	contact,
	db,
	eq,
	label,
	message,
	messageAttachment,
	messageLabel,
	thread,
	user,
} from '@workspace/core/drizzle.js';
import { createAccount } from '@workspace/core/mutate/account.js';
import { createId } from '@workspace/core/util.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteUser } from './user.ts';

describe('deleteUser', () => {
	let userId: string;
	let messageId: string;

	beforeAll(async () => {
		const randomRemoteId = Math.random().toString(36).substring(7);
		const randomEmail = `${Math.random().toString(36).substring(7)}@example.com`;
		const stripeCustomerId = `TEST_STRIPE_CUSTOMER_ID_${Math.random().toString(36).substring(7)}`;
		messageId = createId();

		// Create a fake user
		const [createdUser] = await db
			.insert(user)
			.values({
				id: createId(),
				stripeCustomerId,
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		if (!createdUser) {
			throw new Error('Failed to create user');
		}
		userId = createdUser.id;

		const createdAccount = await createAccount({
			data: {
				id: createId(),
				remoteId: randomRemoteId,
				scope: 'scope',
				name: 'name',
				email: randomEmail,
				historyId: 'HISTORY_ID_1',
				accessTokenEnc: 'ACCESS_TOKEN_ENC',
				accessTokenIv: Buffer.from(''),
				accessTokenAuthTag: Buffer.from(''),
				tokenType: 'Bearer',
				expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
				userId: createdUser.id,
			},
		});

		if (!createdAccount) {
			throw new Error('Failed to create account');
		}

		// Create a label for the user
		const [createdLabel] = await db
			.insert(label)
			.values({
				id: createId(),
				userId: createdUser.id,
				accountId: createdAccount.id,
				remoteId: 'remote-label-id',
				name: 'Test Label',
				type: 'user',
				createdAt: new Date(),
				updatedAt: new Date(),
			})
			.returning();

		// Create a thread for the user
		const [createdThread] = await db
			.insert(thread)
			.values({
				id: createId(),
				userId: createdUser.id,
				accountId: createdAccount.id,
				remoteId: 'remote-thread-id',
				lastSentAt: new Date(),
			})
			.returning();

		if (!createdThread) {
			throw new Error('Failed to create thread');
		}

		// Create a message for the user
		const [createdMessage] = await db
			.insert(message)
			.values({
				id: messageId,
				accountId: createdAccount.id,
				userId: createdUser.id,
				threadId: createdThread.id,
				sentAt: new Date(),
				remoteId: 'remote-message-id',
				subject: 'Test Subject',
				contentText: 'Test Content',
				senderEmail: 'sender@example.com',
				contentHtml: '<p>Test Content</p>',
				updatedAt: new Date(),
			})
			.returning();

		if (!createdMessage || !createdLabel) {
			throw new Error('Failed to create message or label');
		}

		// Create a message label
		await db.insert(messageLabel).values({
			id: createId(),
			messageId: createdMessage.id,
			labelId: createdLabel.id,
		});

		// Create an attachment for the message
		await db.insert(messageAttachment).values({
			id: createId(),
			hash: 'test-hash',
			messageId: createdMessage.id,
			filename: 'test.txt',
			filetype: 'text/plain',
			size: 123,
		});

		// Create a contact for the user
		await db.insert(contact).values({
			id: createId(),
			userId: createdUser.id,
			accountId: createdAccount.id,
			email: 'contact@example.com',
			name: 'Test Contact',
		});
	});

	it('should delete all user data', async () => {
		await deleteUser(userId);

		const foundUser = await db.select().from(user).where(eq(user.id, userId));
		const foundAccounts = await db.select().from(account).where(eq(account.userId, userId));
		const foundThreads = await db.select().from(thread).where(eq(thread.userId, userId));
		const foundMessages = await db.select().from(message).where(eq(message.userId, userId));
		const foundMessageLabels = await db
			.select()
			.from(messageLabel)
			.where(eq(messageLabel.messageId, messageId));
		const foundAttachments = await db
			.select()
			.from(messageAttachment)
			.where(eq(messageAttachment.messageId, messageId));
		const foundLabels = await db.select().from(label).where(eq(label.userId, userId));
		const foundContacts = await db.select().from(contact).where(eq(contact.userId, userId));

		expect(foundUser).toHaveLength(0);
		expect(foundAccounts).toHaveLength(0);
		expect(foundThreads).toHaveLength(0);
		expect(foundMessages).toHaveLength(0);
		expect(foundMessageLabels).toHaveLength(0);
		expect(foundAttachments).toHaveLength(0);
		expect(foundLabels).toHaveLength(0);
		expect(foundContacts).toHaveLength(0);
	});
});
