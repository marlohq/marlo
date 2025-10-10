import type { Account } from '@workspace/core/drizzle.js';
import { gaxios, OAuth2Client } from 'google-auth-library';
import { type gmail_v1, google, type oauth2_v2 } from 'googleapis';
import type { DecryptedTokens } from './oauth/crypto.js';
import { getTokensAndRefreshIfNeeded } from './oauth/refresh.js';

export type GmailClient = gmail_v1.Gmail;
type ClientOrError<T> = { client: T; error: null } | { error: 'unauthenticated'; client: null };

export function getAuthClientFromTokens(tokens: DecryptedTokens) {
	const auth = new OAuth2Client({
		clientId: process.env.GOOGLE_CLIENT_ID,
		clientSecret: process.env.GOOGLE_CLIENT_SECRET,
	});

	auth.setCredentials({
		token_type: tokens.tokenType,
		expiry_date: Number(tokens.expiresAt),
		access_token: tokens.accessToken,
		refresh_token: tokens.refreshToken,
	});

	return auth;
}

export async function verifyTokenPayload(token: string) {
	const client = new OAuth2Client();
	const ticket = await client.verifyIdToken({ idToken: token });
	return ticket.getPayload();
}

export async function getOAuthClientForAccount(
	account: Account,
): Promise<ClientOrError<oauth2_v2.Oauth2>> {
	const tokens = await getTokensAndRefreshIfNeeded(account);
	if (!tokens) return { error: 'unauthenticated', client: null };
	const auth = getAuthClientFromTokens(tokens);
	return { client: google.oauth2({ version: 'v2', auth }), error: null };
}

export function getGmailClientFromAuthClient(auth: OAuth2Client): GmailClient {
	const gmail = google.gmail({ version: 'v1', auth });
	return gmail;
}

export function getGmailClientFromTokens(tokens: DecryptedTokens) {
	return getGmailClientFromAuthClient(getAuthClientFromTokens(tokens));
}

export async function getGmailClientForAccount(
	account: Account,
): Promise<ClientOrError<GmailClient>> {
	const tokens = await getTokensAndRefreshIfNeeded(account);
	if (!tokens) return { error: 'unauthenticated', client: null };
	const gmail = getGmailClientFromTokens(tokens);
	return { client: gmail, error: null };
}

// biome-ignore lint/suspicious/noExplicitAny: Okay as generic type.
export function isGaxiosError<T = any>(error: unknown): error is gaxios.GaxiosError<T> {
	return error instanceof gaxios.GaxiosError;
}
