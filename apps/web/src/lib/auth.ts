import { ORPCError } from '@orpc/server';
import type { AstroCookies } from 'astro';
import { jwtVerify, SignJWT } from 'jose';
import { AUTH_SECRET, SYNC_AUTH_SECRET } from '../env.ts';

const authSecret = new TextEncoder().encode(AUTH_SECRET);

export const SESSION_COOKIE_NAME = 'session';
export const REFRESH_COOKIE_NAME = 'refresh';
const SYNC_JWT_COOKIE_NAME = 'syncjwt';
const EXPECTED_SESSION_STATE_COOKIE_NAME = 'expected_session_state';

export interface UserJWTPayload {
	sub: string;
	iat?: number;
	exp?: number;
	userId: string;
}

export async function createSessionJWT(userData: Partial<UserJWTPayload>) {
	return await new SignJWT({
		...userData,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('15m')
		.sign(authSecret);
}

export async function createRefreshJWT(userData: Partial<UserJWTPayload>) {
	return await new SignJWT({
		...userData,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('20d')
		.sign(authSecret);
}

export async function verifyJWT(token: string): Promise<UserJWTPayload | null> {
	try {
		const { payload } = await jwtVerify<UserJWTPayload>(token, authSecret);
		return payload;
	} catch {
		// jwtVerify throws if the token is invalid or expired.
		return null;
	}
}

export async function createSessionJWTAndSetCookie(
	context: { cookies: AstroCookies },
	userData: Partial<UserJWTPayload>,
) {
	const jwt = await createSessionJWT(userData);

	context.cookies.set(SESSION_COOKIE_NAME, jwt, {
		path: '/',
		httpOnly: true,
		secure: import.meta.env.PROD,
		// Need to set to lax because these are initially created in /auth/google/callback
		// which comes from a redirect from Google.
		sameSite: 'lax',
		maxAge: 60 * 15, // 15 minutes
	});
}

export async function createRefreshJWTAndSetCookie(
	context: { cookies: AstroCookies },
	userData: Partial<UserJWTPayload>,
) {
	const jwt = await createRefreshJWT(userData);

	context.cookies.set(REFRESH_COOKIE_NAME, jwt, {
		path: '/',
		httpOnly: true,
		secure: import.meta.env.PROD,
		// Need to set to lax because these are initially created in /auth/google/callback
		// which comes from a redirect from Google.
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 20, // 20 days
	});
}

export async function createSessionAndRefreshJWTsAndSetCookies(
	context: { cookies: AstroCookies },
	userData: Partial<UserJWTPayload>,
) {
	await Promise.all([
		createSessionJWTAndSetCookie(context, userData),
		createRefreshJWTAndSetCookie(context, userData),
	]);
}

export function createUserData(accountId: string, userId: string) {
	return {
		sub: accountId,
		userId,
	} satisfies UserJWTPayload;
}

export function deleteAllCookiesOnLogout(context: { cookies: AstroCookies }) {
	context.cookies.delete(SESSION_COOKIE_NAME, { path: '/' });
	context.cookies.delete(REFRESH_COOKIE_NAME, { path: '/' });
	context.cookies.delete(SYNC_JWT_COOKIE_NAME, { path: '/' });
	context.cookies.delete(EXPECTED_SESSION_STATE_COOKIE_NAME, { path: '/' });
}

export async function getCurrentAccount(context: { locals: App.Locals }) {
	return context.locals.currentAccount();
}

export async function getCurrentAccountOrThrow(context: { locals: App.Locals }) {
	const currentAccount = await getCurrentAccount(context);
	if (!currentAccount) {
		throw new ORPCError('UNAUTHORIZED');
	}
	return currentAccount;
}

export async function getActiveAccountOrThrow(context: { locals: App.Locals }) {
	const currentAccount = await getCurrentAccountOrThrow(context);
	if (currentAccount.user.status === 'INACTIVE') {
		throw new ORPCError('FORBIDDEN');
	}
	return currentAccount;
}

export async function createSyncJWT(userData: { sub: string; email: string; userId: string }) {
	const syncAuthSecret = new TextEncoder().encode(SYNC_AUTH_SECRET);
	return await new SignJWT({
		...userData,
	})
		.setProtectedHeader({ alg: 'HS256' })
		.setIssuedAt()
		.setExpirationTime('30d')
		.sign(syncAuthSecret);
}

export async function createSyncJWTAndSetCookie(
	context: { cookies: AstroCookies },
	accountId: string,
	userId: string,
	email: string,
) {
	const jwt = await createSyncJWT({ sub: accountId, email, userId });

	context.cookies.set(SYNC_JWT_COOKIE_NAME, jwt, {
		path: '/',
		httpOnly: false,
		secure: import.meta.env.PROD,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24, // 24 hours
	});
}

/**
 * We use this cookie to track the expected session state. This cookie is longer lived than the
 * rest, which lets us determine if the user has logged out or is dealing with an expired session by
 * checking for the existence of this cookie.
 */
export function setExpectedSessionStateCookie(
	context: { cookies: AstroCookies },
	action: 'active',
) {
	context.cookies.set(EXPECTED_SESSION_STATE_COOKIE_NAME, action, {
		path: '/',
		httpOnly: false,
		secure: import.meta.env.PROD,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 90, // 90 days
	});
}

/**
 * Generate a auth deep link for authentication in Electron (ex:
 * marlo://app/auth?session=<session>&refresh=<refresh>)
 */
export function generateAuthDeeplink({
	session,
	refresh,
	error,
}: {
	session?: string;
	refresh?: string;
	error?: string;
}) {
	const url = new URL('marlo://auth');

	if (session) {
		url.searchParams.set('session', session);
	}
	if (refresh) {
		url.searchParams.set('refresh', refresh);
	}
	if (error) {
		url.searchParams.set('error', error);
	}

	return url;
}
