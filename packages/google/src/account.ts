import {
	type Account,
	account as accountTable,
	db,
	eq,
	signature as signatureTable,
} from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import {
	createUserPictureHash,
	deleteUserPicture,
	uploadUserPicture,
} from '@workspace/core/storage/user-profile.js';
import { createId } from '@workspace/core/util.js';
import { invariant } from 'es-toolkit';
import type { gmail_v1, oauth2_v2 } from 'googleapis';

export async function watchAccount(gmail: gmail_v1.Gmail, accountId: string) {
	const response = await gmail.users.watch({
		userId: 'me',
		requestBody: {
			topicName: process.env.GOOGLE_GMAIL_TOPIC,
		},
	});

	invariant(response.status === 200, 'Google: watching the email was not successful.');
	invariant(response.data.historyId, 'Google: historyId is required and expected');
	invariant(response.data.expiration, 'Google: expiration is required and expected');

	logger.info(
		{ historyId: response.data.historyId, expiration: response.data.expiration, accountId },
		'Setting up watch for user',
	);

	return {
		historyId: response.data.historyId,
		expiration: new Date(Number.parseInt(response.data.expiration)),
	};
}

export async function updateAccountWithHistoryId(account: Account, historyId: string) {
	return await db
		.update(accountTable)
		.set({ historyId })
		.where(eq(accountTable.id, account.id))
		.returning();
}

export async function updateAccountWatchExpiration(account: Account, expiration: Date) {
	return await db
		.update(accountTable)
		.set({ watchExpiration: expiration })
		.where(eq(accountTable.id, account.id))
		.returning();
}

export async function updateAccountContactSyncToken(account: Account, token: string) {
	return await db
		.update(accountTable)
		.set({ contactsSyncToken: token })
		.where(eq(accountTable.id, account.id))
		.returning();
}

export async function updateAccountOtherContactsSyncToken(account: Account, token: string) {
	return await db
		.update(accountTable)
		.set({ otherContactsSyncToken: token })
		.where(eq(accountTable.id, account.id))
		.returning();
}

export async function updateAccountInfo(account: Account, userInfo: oauth2_v2.Schema$Userinfo) {
	const updateData: Partial<typeof account> = {};

	if (userInfo.picture) {
		const pictureHash = createUserPictureHash(account.userId, account.id, userInfo.picture);

		if (account.pictureHash !== pictureHash) {
			const picture = await fetch(userInfo.picture);

			if (!picture.ok) {
				logger.error(
					{ accountId: account.id, pictureUrl: userInfo.picture },
					'Failed to fetch user picture, not updating',
				);
			} else {
				const pictureData = await picture.arrayBuffer();
				await uploadUserPicture(account.userId, pictureHash, Buffer.from(pictureData));

				if (account.pictureHash) await deleteUserPicture(account.userId, account.pictureHash);

				updateData.pictureHash = pictureHash;
			}
		}
	}

	if (userInfo.name && userInfo.name !== account.name) {
		updateData.name = userInfo.name;
	}

	if (Object.keys(updateData).length > 0) {
		await db.update(accountTable).set(updateData).where(eq(accountTable.id, account.id));
	}
}

export async function updateAccountAvatar(account: Account, pictureUrl: string | null | undefined) {
	return updateAccountInfo(account, { picture: pictureUrl });
}

export async function updateGmailAccountSignature(account: Account, gmail: gmail_v1.Gmail) {
	const sendAs = await gmail.users.settings.sendAs.list({
		userId: 'me',
	});

	const mainSendAs = sendAs.data.sendAs?.find((sendAs) => sendAs.isPrimary);

	if (!mainSendAs) {
		logger.warn({ accountId: account.id }, 'No primary sendAs found');
		return;
	}

	const content = mainSendAs.signature || '';

	return await db
		.insert(signatureTable)
		.values({
			id: createId(),
			accountId: account.id,
			gmail: true,
			name: 'Gmail signature',
			default: true,
			content,
		})
		.onConflictDoUpdate({
			target: [signatureTable.accountId, signatureTable.gmail],
			set: {
				content,
				updatedAt: new Date(),
			},
		})
		.returning();
}
