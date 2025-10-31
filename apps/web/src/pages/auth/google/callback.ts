import type {
	Account,
	InferInsertModel,
	TransactionOrDatabase,
	User,
} from '@workspace/core/drizzle.js';
import { account as accountTable, db, eq, user as userTable } from '@workspace/core/drizzle.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createAccount, updateAccount } from '@workspace/core/mutate/account.js';
import { createId } from '@workspace/core/util.js';
import { updateAccountAvatar } from '@workspace/google/account.js';
import { getAuthClient, getUserData, watchEmailAndIngestHistory } from '@workspace/google/login.js';
import { getClient, isClientWithCodeVerifier } from '@workspace/google/oauth/client.js';
import { oauthConfig } from '@workspace/google/oauth/config.js';
import {
	encryptTokens,
	getExpiresAt,
	serializeScopes,
	validateState,
} from '@workspace/google/oauth/crypto.js';
import { accountNeedsReauthorization } from '@workspace/google/oauth/refresh.js';
import { ArcticFetchError, OAuth2RequestError, type OAuth2Tokens } from 'arctic';
import type { APIRoute, AstroCookies } from 'astro';
import { invariant } from 'es-toolkit';
import { FEATURE_STRIPE_ENABLED } from '../../../env.ts';
import {
	createSessionAndRefreshJWTsAndSetCookies,
	createUserData,
	generateAuthDeeplink,
	getCurrentAccount,
} from '../../../lib/auth.ts';
import { createStripeCustomer } from '../../../lib/stripe.ts';

type AccountWithUser = Account & { user: User };

export const GET: APIRoute = async ({ url, locals, cookies, params, redirect: astroRedirect }) => {
	const code = url.searchParams.get('code');
	const scope = url.searchParams.get('scope');
	const error = url.searchParams.get('error');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('oauth_state')?.value;
	const codeVerifier = cookies.get('oauth_codeverifier')?.value;
	const platform = cookies.get('oauth_platform')?.value;
	cookies.delete('oauth_state', { path: '/' });
	cookies.delete('oauth_codeverifier', { path: '/' });

	if (error) {
		// Preserve platform parameter in error redirects
		if (platform) {
			cookies.delete('oauth_platform', { path: '/' });

			// If desktop, redirect to success page with error
			if (platform === 'desktop') {
				const deepLinkUrl = generateAuthDeeplink({
					error,
				});
				const successUrl = new URL('/auth/desktop-success', url);
				successUrl.searchParams.set('deeplink', deepLinkUrl.toString());
				return astroRedirect(successUrl.toString());
			}

			return astroRedirect(`/?error=${error}&platform=${platform}`);
		}

		return astroRedirect(`/?error=${error}`);
	}
	if (!code) {
		return new Response('Missing code parameter', { status: 400 });
	}
	if (!scope) {
		return new Response('Missing scope parameter', { status: 400 });
	}
	if (!state) {
		return new Response('Missing state parameter', { status: 400 });
	}
	if (!validateState(state, storedState)) {
		return new Response('Invalid state parameter', { status: 400 });
	}

	const redirectUri = new URL(`/auth/google/callback`, url);
	const client = getClient(oauthConfig, 'google', redirectUri);
	let tokens: OAuth2Tokens;

	if (isClientWithCodeVerifier(client) && !codeVerifier) {
		return new Response('Missing code verifier', { status: 400 });
	}

	try {
		if (isClientWithCodeVerifier(client)) {
			invariant(codeVerifier, 'Missing code verifier, already checked for this earlier');
			tokens = await client.validateAuthorizationCode(code, codeVerifier);
		} else {
			tokens = await client.validateAuthorizationCode(code);
		}
	} catch (error) {
		baseLogger.warn({ error }, 'OAuth callback error');
		if (error instanceof OAuth2RequestError) {
			const code = error.code;
			return new Response(`Invalid authorization code: ${code}`, { status: 400 });
		}
		if (error instanceof ArcticFetchError) {
			const cause = error.cause;
			return new Response(`Failed to fetch tokens: ${cause}`, { status: 500 });
		}
		throw error;
	}

	const currentAccount = await getCurrentAccount({ locals });
	const currentGoogleUser = await getUserData(tokens, oauthConfig).catch((error) => null);
	if (!currentGoogleUser) {
		baseLogger.error({ currentAccount: currentAccount?.id }, 'Failed to get user data from Google');
		return new Response(`Failed to get user data from Google`, { status: 400 });
	}

	const existingAccount = await getExistingAccount(currentGoogleUser);
	const logger = baseLogger.child({
		namespace: 'oauth.callback',
		currentAccountId: currentAccount?.id,
		currentUserId: currentAccount?.user.id,
		currentGoogleUserId: currentGoogleUser.id,
		existingAccountId: existingAccount?.id,
	});

	const logFlow = (id: string, data: Record<string, unknown> = {}) => {
		logger.info({ id, ...data }, 'callback flow started');
	};

	const finalizeLogin = async ({ loginAsAccount }: { loginAsAccount: AccountWithUser }) => {
		// Check if the account has valid tokens, and if not, prompt the user to reauthorize the scopes.
		if (loginAsAccount && (await accountNeedsReauthorization(loginAsAccount))) {
			logger.error({ loginAsAccount: loginAsAccount.id }, 'reauthorization required');
			return astroRedirect(
				`/auth/google/authorize?reauthorize=true&login_hint=${loginAsAccount.email}`,
			);
		}

		await createCookiesOnSuccessfulLogin(cookies, loginAsAccount);
		await updateAccountAvatar(loginAsAccount, currentGoogleUser.picture).catch((error) => {
			captureException({ error }, 'Failed to update account avatar');
		});

		// Start ingestion and redirect to the home page.
		if (loginAsAccount.user.status !== 'INACTIVE') {
			logger.info(
				{ loginAsAccount: loginAsAccount.id, userStatus: loginAsAccount.user.status },
				'start ingestion',
			);
			const auth = getAuthClient(tokens);
			await watchEmailAndIngestHistory({ auth, account: loginAsAccount });
		} else {
			logger.info(
				{ loginAsAccount: loginAsAccount.id, userStatus: loginAsAccount.user.status },
				'skip ingestion',
			);
		}

		logger.info({ loginAsAccount: loginAsAccount.id }, 'login completed');

		// Handle desktop redirect with auth tokens
		cookies.delete('oauth_platform', { path: '/' });
		if (platform === 'desktop') {
			const sessionCookie = cookies.get('session')?.value;
			const refreshCookie = cookies.get('refresh')?.value;
			const deepLinkUrl = generateAuthDeeplink({
				session: sessionCookie,
				refresh: refreshCookie,
			});
			const successUrl = new URL('/auth/desktop-success', url);
			successUrl.searchParams.set('deeplink', deepLinkUrl.toString());
			return astroRedirect(successUrl.toString());
		}

		// Normal web redirect
		return astroRedirect('/');
	};

	////////////////////////////////////////////////////////////
	// 1. User is currently logged in, and re-authorizing with the current account.
	////////////////////////////////////////////////////////////
	if (currentAccount && currentAccount.remoteId === currentGoogleUser.id) {
		logFlow('auth.current_account');
		const updatedAccount = await updateAccount({
			where: eq(accountTable.id, currentAccount.id),
			data: createAccountDataPayload({
				user: currentAccount.user,
				googleUser: currentGoogleUser,
				tokens,
			}),
		});
		const loginAsAccount = { ...updatedAccount, user: currentAccount.user };
		return await finalizeLogin({ loginAsAccount });
	}

	////////////////////////////////////////////////////////////
	// 2. User is currently logged in, and authorizing with a different account that already exists in our system.
	////////////////////////////////////////////////////////////
	if (currentAccount && existingAccount) {
		// Don't allow a user to login with a different account that already exists in our system.
		if (currentAccount.userId !== existingAccount.userId) {
			logFlow('error.account_already_exists');
			return astroRedirect('/?error=account_already_exists');
		}
		logFlow('auth.switch_account');
		const updatedAccount = await updateAccount({
			where: eq(accountTable.remoteId, currentGoogleUser.id),
			data: createAccountDataPayload({
				user: currentAccount.user,
				googleUser: currentGoogleUser,
				tokens,
			}),
		});
		const loginAsAccount = { ...updatedAccount, user: currentAccount.user };
		return await finalizeLogin({ loginAsAccount });
	}

	////////////////////////////////////////////////////////////
	// 3. User is currently logged in, and authorizing with a new account that does not yet exist in our system.
	////////////////////////////////////////////////////////////
	if (currentAccount) {
		logFlow('auth.add_account');
		const newAccount = await createAccount({
			data: createAccountDataPayload({
				user: currentAccount.user,
				googleUser: currentGoogleUser,
				tokens,
			}),
		});
		const loginAsAccount = { ...newAccount, user: currentAccount.user };
		return await finalizeLogin({ loginAsAccount });
	}

	////////////////////////////////////////////////////////////
	// 4. User is not logged in, and authorizing with an existing account that already exists in our system.
	////////////////////////////////////////////////////////////
	if (existingAccount) {
		logFlow('login.existing_user');
		const updatedAccount = await updateAccount({
			data: createAccountDataPayload({
				user: existingAccount.user,
				googleUser: currentGoogleUser,
				tokens,
			}),
			where: eq(accountTable.remoteId, currentGoogleUser.id),
		});
		const loginAsAccount = { ...updatedAccount, user: existingAccount.user };
		return await finalizeLogin({ loginAsAccount });
	}

	////////////////////////////////////////////////////////////
	// 5. User is not logged in, and authorizing with an new account that does not yet exist in our system.
	////////////////////////////////////////////////////////////
	logFlow('login.new_user');
	const loginAsAccount = await db.transaction(async (tx) => {
		logger.info({}, 'creating user');
		const newUser = await createNewUser({ tx, googleUser: currentGoogleUser });
		logger.info({ forUser: newUser.id }, 'creating account');
		const newAccount = await createAccount({
			tx,
			data: createAccountDataPayload({
				user: newUser,
				googleUser: currentGoogleUser,
				tokens,
			}),
		});
		return { ...newAccount, user: newUser };
	});
	return await finalizeLogin({ loginAsAccount });
};

async function getExistingAccount(
	googleUser: Awaited<ReturnType<typeof getUserData>>,
): Promise<AccountWithUser | null> {
	return (
		(await db.query.account.findFirst({
			where: (account, { eq }) => eq(account.remoteId, googleUser.id),
			with: { user: true },
		})) ?? null
	);
}

function createAccountDataPayload({
	user,
	googleUser,
	tokens,
}: {
	user: User;
	googleUser: Awaited<ReturnType<typeof getUserData>>;
	tokens: OAuth2Tokens;
}): InferInsertModel<typeof accountTable> {
	return {
		remoteId: googleUser.id,
		userId: user.id,
		scope: serializeScopes(tokens),
		name: googleUser.name,
		email: googleUser.email,
		status: 'ACTIVE',
		errorCode: null,
		expiresAt: getExpiresAt(tokens),
		...encryptTokens(tokens),
	};
}

async function createNewUser({
	tx: txOrDb = db,
	googleUser,
}: {
	tx?: TransactionOrDatabase;
	googleUser: Awaited<ReturnType<typeof getUserData>>;
}) {
	const newStripeCustomerId = await createStripeCustomer(googleUser.email);
	const newUserId = createId();
	const newUserData = await txOrDb
		.insert(userTable)
		.values({
			id: newUserId,
			stripeCustomerId: newStripeCustomerId,
			status: FEATURE_STRIPE_ENABLED ? 'INACTIVE' : 'ACTIVE',
		})
		.returning();
	invariant(newUserData[0], 'Failed to create user');
	return newUserData[0];
}

async function createCookiesOnSuccessfulLogin(cookies: AstroCookies, account: Account) {
	await createSessionAndRefreshJWTsAndSetCookies(
		{ cookies },
		createUserData(account.id, account.userId),
	);
}
