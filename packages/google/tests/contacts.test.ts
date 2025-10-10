import { contactIngestionQueue, queueContactIngestionFromEmail } from '@workspace/core/contacts.js';
import type { Account, User } from '@workspace/core/drizzle.js';
import { and, contact, db, eq } from '@workspace/core/drizzle.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { type ContactData, consumeContact } from '../src/mail-ingestion/ingest.ts';

describe('Contacts', () => {
	let account: Account;
	let user: User;

	beforeAll(async () => {
		const { account: testAccount, user: testUser } = await createTestAccount();

		account = testAccount;
		user = testUser;
	});

	it('can queue contacts', async () => {
		await queueContactIngestionFromEmail(user.id, account.id, 'test@example.com', 'Test User');

		if ('getGroupJobs' in contactIngestionQueue) {
			const queuedContacts = await contactIngestionQueue.getGroupJobs(account.id);
			expect(queuedContacts.length).toBeGreaterThan(0);
		} else {
			const queuedContacts = await contactIngestionQueue.getJobs(['waiting', 'active', 'delayed']);
			expect(queuedContacts.length).toBeGreaterThan(0);
		}
	});

	it('can consume contacts', async () => {
		// Create contact data from email and name only
		const contactData: ContactData = {
			email: 'test@example.com',
			name: 'Test Contact',
		};

		await consumeContact({
			contactData,
			userId: user.id,
			accountId: account.id,
		});

		const dbContact = await db
			.select()
			.from(contact)
			.where(and(eq(contact.accountId, account.id), eq(contact.email, contactData.email)))
			.then((rows) => rows[0] || null);

		expect(dbContact).toBeDefined();
		expect(dbContact?.accountId).toBe(account.id);
		expect(dbContact?.email).toBe(contactData.email);
		expect(dbContact?.name).toBe(contactData.name);
	});
});
