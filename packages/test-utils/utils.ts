import type { Account, User } from '@workspace/core/drizzle.js';
import { db, user as userTable } from '@workspace/core/drizzle.js';
import { createAccount } from '@workspace/core/mutate/account.js';
import { createId } from '@workspace/core/util.js';

export async function createTestAccount(email?: string): Promise<{ account: Account; user: User }> {
	const userId = createId();
	const accountId = createId();
	const stripeCustomerId = `test_${createId()}`;

	return await db.transaction(async (tx) => {
		const [createdUser] = await tx
			.insert(userTable)
			.values({
				id: userId,
				stripeCustomerId,
			})
			.returning();

		if (!createdUser) {
			throw new Error('Failed to create test user');
		}

		const createdAccount = await createAccount({
			tx,
			data: {
				id: accountId,
				userId: createdUser.id,
				remoteId: `test-${userId}`,
				name: 'Test Account',
				email: email ?? `test-${userId}@marlo.so`,
				scope:
					'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/gmail.compose openid https://www.googleapis.com/auth/pubsub',
				accessTokenEnc: '',
				accessTokenIv: Buffer.from(''),
				accessTokenAuthTag: Buffer.from(''),
			},
		});

		if (!createdAccount) {
			throw new Error('Failed to create test account');
		}

		return { user: createdUser, account: createdAccount };
	});
}
