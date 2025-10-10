import type { Account } from '@workspace/core/drizzle.js';
import { db, eq, label } from '@workspace/core/drizzle.js';
import { createTestAccount } from '@workspace/test-utils/utils.js';
import { invariant } from 'es-toolkit';
import type { gmail_v1 } from 'googleapis';
import { beforeAll, describe, expect, it } from 'vitest';
import { batchLoadLabels } from '../src/mail-ingestion/batch-load.ts';
import { getGmailClientForAccount } from '../src/request-client.ts';

describe('Batch loading', () => {
	let account: Account;
	let gmail: gmail_v1.Gmail;

	beforeAll(async () => {
		const { account: testAccount } = await createTestAccount();

		const { client } = await getGmailClientForAccount(account);
		invariant(client, 'Gmail client not found');
		account = testAccount;
		gmail = client;
	});

	it('can batch load all the user labels', async () => {
		await batchLoadLabels({
			gmail,
			accountId: account.id,
			userId: account.userId,
		});

		const dbLabels = await db.select().from(label).where(eq(label.accountId, account.id));

		expect(dbLabels.length).toBeGreaterThan(0);
	});
});
