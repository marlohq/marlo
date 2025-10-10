import { defineMiddleware, sequence } from 'astro:middleware';
import { db } from '@workspace/core/drizzle.js';
import { captureException, captureUserContext } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createId } from '@workspace/core/util.js';
import {
	createRefreshJWTAndSetCookie,
	createSessionJWTAndSetCookie,
	deleteAllCookiesOnLogout,
	REFRESH_COOKIE_NAME,
	SESSION_COOKIE_NAME,
	type UserJWTPayload,
	verifyJWT,
} from './lib/auth.ts';

const logger = baseLogger.child({ namespace: 'middleware' });

function setAuthLocals(locals: App.Locals, claims: UserJWTPayload) {
	locals.claims = claims;

	locals.currentAccount = async () => {
		if (locals._currentAccount) {
			return locals._currentAccount;
		}

		const account =
			(await db.query.account.findFirst({
				where: (account, { eq }) => eq(account.id, claims.sub),
				with: { user: true },
			})) ?? null;

		locals._currentAccount = account;
		return account;
	};
}

const logRequest = defineMiddleware(async ({ request, url, clientAddress }, next) => {
	const startTimeMs = performance.now();
	return await baseLogger.adopt(
		() => {
			let response: Response | undefined;
			let responseError: unknown | undefined;
			logger.debug('get request');
			return next()
				.then((_response) => {
					response = _response;
					return response;
				})
				.catch((error) => {
					responseError = error;
					throw responseError;
				})
				.finally(() => {
					// log the response, regardless of resolve vs. reject
					const endTime = performance.now();
					const totalTime = Math.round(endTime - startTimeMs);
					logger.debug(
						{
							duration: totalTime,
							status: response?.status,
							error: responseError,
						},
						'send response',
					);
					return response;
				});
		},
		{
			requestId: createId(),
			url: request.url,
			method: request.method,
			pathname: url.pathname,
			routeKey: `${request.method} ${url.pathname}`,
			ip: clientAddress,
		},
	);
});

const auth = defineMiddleware(async ({ cookies, locals }, next) => {
	const jwt = cookies.get(SESSION_COOKIE_NAME)?.value;
	const refreshJWT = cookies.get(REFRESH_COOKIE_NAME)?.value;
	// If the session token exists, verify it and set the claims.
	if (jwt) {
		const claims = await verifyJWT(jwt);
		if (claims) {
			setAuthLocals(locals, claims);
			// Always create a new refresh token so we can refresh the session token later.
			await createRefreshJWTAndSetCookie({ cookies }, claims);
			return next();
		}
	}

	// JWT doesn't exist or the claims are invalid, try to refresh the token.
	if (refreshJWT) {
		const claims = await verifyJWT(refreshJWT);
		if (claims) {
			setAuthLocals(locals, claims);
			// Create a new session token.
			await createSessionJWTAndSetCookie({ cookies }, claims);
			// Always create a new refresh token so we can refresh the session token later.
			await createRefreshJWTAndSetCookie({ cookies }, claims);
			return next();
		}
	}

	// Failed to authenticate, set the claims to an empty object.
	locals.claims = {};
	locals.currentAccount = async () => null;
	return next();
});

const ensureUserHasActiveAccount = defineMiddleware(
	async ({ cookies, locals, redirect, url }, next) => {
		const account = await locals.currentAccount();
		if (!account) {
			return next();
		}

		const isLoginRoute = url.pathname.startsWith('/auth/google');

		// If the account is in an error state and the user is not trying to reauthorize, log them out.
		if (account.status === 'ERROR' && !isLoginRoute) {
			logger.info(
				{
					accountId: account.id,
					userId: account.userId,
					errorCode: account.errorCode,
					loggingOut: true,
				},
				'Account is in an error state, logging user out',
			);

			// Log the user out.
			deleteAllCookiesOnLogout({ cookies });
			return redirect('/');
		}

		return next();
	},
);

const logAuth = defineMiddleware(async ({ locals }, next) => {
	const jwt = locals.claims;
	captureUserContext({ id: jwt.sub });
	return await baseLogger.adopt(() => next(), {
		jwt: {
			sub: jwt.sub,
			iat: jwt.iat,
			exp: jwt.exp,
		},
	});
});

const logError = defineMiddleware(async (_, next) => {
	return await next().catch((error) => {
		captureException({ error, namespace: 'middleware' }, 'Unhandled exception');
		throw error;
	});
});

export const onRequest = sequence(logRequest, auth, logAuth, ensureUserHasActiveAccount, logError);
