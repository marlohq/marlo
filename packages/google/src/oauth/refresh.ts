import { type Account, account as accountTable, db, eq } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { getClient } from './client.ts';
import { oauthConfig } from './config.js';
import { type DecryptedTokens, decryptTokensFromAccount, encryptTokens } from './crypto.ts';

const logger = baseLogger.child({ namespace: 'oauth' });

async function refreshConnectionTokenFromTokens(accountId: string, creds: DecryptedTokens) {
	if (!creds.refreshToken) {
		logger.info({ accountId }, 'No refresh token found');
		return null;
	}

	const client = getClient(oauthConfig);

	if (!client.refreshAccessToken) {
		logger.info({ accountId }, 'Client does not support refreshAccessToken');
		return null;
	}

	try {
		const tokens = await client.refreshAccessToken(creds.refreshToken);

		const updatedAccounts = await db
			.update(accountTable)
			.set({
				...encryptTokens(tokens),
				expiresAt: tokens.accessTokenExpiresAt(),
				status: 'ACTIVE',
			})
			.where(eq(accountTable.id, accountId))
			.returning();

		const newAccount = updatedAccounts[0];
		if (!newAccount) {
			throw new Error('Failed to update account');
		}

		logger.info(
			{
				accountId,
				expiresAt: tokens.accessTokenExpiresAt().toUTCString(),
				hasRefreshTokenEnc: !!newAccount.refreshTokenEnc,
				hasAccessRefreshTokenIv: !!newAccount.accessTokenIv,
				hasAccessRefreshTokenAuthTag: !!newAccount.accessTokenAuthTag,
			},
			'Refreshed app token',
		);
		return newAccount;
	} catch (error: unknown) {
		logger.warn({ error, accountId }, 'Failed to refresh token');
		const errorCode =
			typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

		const updatedAccounts = await db
			.update(accountTable)
			.set({
				status: 'ERROR',
				errorCode: errorCode?.toString(),
			})
			.where(eq(accountTable.id, accountId))
			.returning();

		return updatedAccounts[0];
	}
}

export async function refreshConnectionToken(account: Account) {
	try {
		const creds = decryptTokensFromAccount(account);
		if (!creds) {
			logger.info({ accountId: account.id }, 'No tokens found');
			if (account.expiresAt && account.expiresAt < new Date()) {
				const updatedAccounts = await db
					.update(accountTable)
					.set({ status: 'ERROR' })
					.where(eq(accountTable.id, account.id))
					.returning();

				return updatedAccounts[0];
			}
			return null;
		}

		return refreshConnectionTokenFromTokens(account.id, creds);
	} catch (error: unknown) {
		logger.warn({ error, accountId: account.id }, 'Failed to refresh token');
		const errorCode =
			typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;

		const updatedAccounts = await db
			.update(accountTable)
			.set({
				status: 'ERROR',
				errorCode: errorCode?.toString(),
			})
			.where(eq(accountTable.id, account.id))
			.returning();

		return updatedAccounts[0];
	}
}

function tokenIsExpired(account: Account) {
	return !account.expiresAt || account.expiresAt.valueOf() < Date.now();
}

export async function getTokensAndRefreshIfNeeded(account: Account) {
	const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000);

	if (!account.expiresAt || account.expiresAt < tenMinutesFromNow) {
		const newAccount = await refreshConnectionToken(account);

		if (newAccount) {
			// If there's an error then the token is no longer valid, just bail.
			if (newAccount.status === 'ERROR') {
				return undefined;
			}

			return decryptTokensFromAccount(newAccount);
		}

		// If there was no account returned then we couldn't refresh the tokens.
		// If the token is still valid as of right now, we can try and use them.
		if (tokenIsExpired(account)) {
			return decryptTokensFromAccount(account);
		}

		// The token is expired and we couldn't refresh.
		return undefined;
	}

	return decryptTokensFromAccount(account);
}

export async function accountNeedsReauthorization(account: Account) {
	// If the account is in an error state, we need to reauthorize.
	if (account.status === 'ERROR') {
		return true;
	}

	// First check if we have any tokens at all
	const creds = decryptTokensFromAccount(account);
	if (!creds) {
		return true;
	}

	// If we don't have a refresh token, we need to reauthorize
	if (!creds.refreshToken) {
		return true;
	}

	// Try to refresh the token to validate it
	const newAccount = await refreshConnectionTokenFromTokens(account.id, creds);
	if (!newAccount || newAccount.status === 'ERROR') {
		return true;
	}

	return false;
}
