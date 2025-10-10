import type { account as accountTable, user as userTable } from '@workspace/core/drizzle.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { OAuthConfig } from '@workspace/core/oauth.js';
import type { OAuth2Tokens } from 'arctic';
import { invariant } from 'es-toolkit';
import { OAuth2Client } from 'google-auth-library';
import { google, type oauth2_v2 } from 'googleapis';
import {
	updateAccountWatchExpiration,
	updateAccountWithHistoryId,
	updateGmailAccountSignature,
	watchAccount,
} from './account.ts';
import { batchLoadAll } from './mail-ingestion/batch-load.js';
import { queueHistoryRefresh } from './mail-ingestion/history.ts';

const logger = baseLogger.child({ namespace: 'google:login' });

type Account = typeof accountTable.$inferSelect;
type User = typeof userTable.$inferSelect;
type AccountWithUser = Account & { user: User };

interface WatchEmailAndIngestHistoryOptions {
	auth: OAuth2Client;
	account: Account;
}

export async function watchEmailAndIngestHistory({
	auth,
	account,
}: WatchEmailAndIngestHistoryOptions) {
	const gmail = google.gmail({ version: 'v1', auth });

	const accountWatch = await watchAccount(gmail, account.id);

	const currentHistoryId = account.historyId;

	// No historyId, just load everything.
	if (!currentHistoryId) {
		await updateAccountWithHistoryId(account, accountWatch.historyId);

		// Trigger the batch load in the background, do not wait for it to complete.
		// If it fails, we have no way to report that back to the user / application.
		batchLoadAll({ gmail, account }).catch((error) => {
			captureException({ error }, 'batchLoadAll() failed');
		});
	} else {
		await queueHistoryRefresh(account.email);
	}

	await updateGmailAccountSignature(account, gmail);
	await updateAccountWatchExpiration(account, accountWatch.expiration);
}

export function getAuthClient(tokens: OAuth2Tokens) {
	const auth = new OAuth2Client({
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
	});

	const expiresIn = tokens.accessTokenExpiresInSeconds();
	const expiryDate = new Date(Date.now() + expiresIn * 1000);

	auth.setCredentials({
		token_type: tokens.tokenType(),
		expiry_date: expiryDate.getTime(),
		access_token: tokens.accessToken(),
		id_token: tokens.idToken(),
		refresh_token: tokens.hasRefreshToken() ? tokens.refreshToken() : undefined,
	});
	return auth;
}

export async function getUserData(tokens: OAuth2Tokens, oauth: OAuthConfig | undefined) {
	const auth = getAuthClient(tokens);
	const { data } = await auth.request<oauth2_v2.Schema$Userinfo>({
		url: oauth?.userInfoUrl,
	});

	invariant(data, 'No user data found');
	invariant(data.id, 'No user id found');
	invariant(data.email, 'No user email found');
	invariant(data.name, 'No user name found');

	const user = {
		name: data.name,
		email: data.email,
		id: data.id,
		picture: data.picture,
	};

	return user;
}
