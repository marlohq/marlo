import { logger as baseLogger } from '@workspace/core/logger.js';
import type { OAuthConfig } from '@workspace/core/oauth.js';
import { getClient, isClientWithCodeVerifier } from '@workspace/google/oauth/client.js';
import { generateCodeVerifier, generateState } from 'arctic';
import type { APIContext } from 'astro';

const logger = baseLogger.child({ namespace: 'oauth' });

import { oauthConfig } from '@workspace/google/oauth/config.js';
import { accountNeedsReauthorization } from '@workspace/google/oauth/refresh.js';
import { getCurrentAccount } from '../../../lib/auth.ts';
export async function GET({ params, cookies, redirect, url, locals }: APIContext) {
	const redirectUri = new URL(`/auth/google/callback`, url);
	const reauthorize = url.searchParams.get('reauthorize');
	const loginHint = url.searchParams.get('login_hint');
	const platform = url.searchParams.get('platform');
	const prompt = url.searchParams.get('prompt');

	const currentAccount = await getCurrentAccount({ locals });
	const client = getClient(oauthConfig, 'google', redirectUri);

	try {
		const state = generateState();

		// Store state in cookie
		cookies.set('oauth_state', state, {
			path: '/',
			secure: import.meta.env.PROD,
			httpOnly: true,
			maxAge: 60 * 5, // 5 minutes
			sameSite: 'lax',
		});

		// Store platform parameter if present
		if (platform) {
			cookies.set('oauth_platform', platform, {
				path: '/',
				secure: import.meta.env.PROD,
				httpOnly: true,
				maxAge: 60 * 5, // 5 minutes
				sameSite: 'lax',
			});
		}

		let authUrl: URL;
		if (isClientWithCodeVerifier(client)) {
			const codeVerifier = generateCodeVerifier();

			cookies.set('oauth_codeverifier', codeVerifier, {
				path: '/',
				secure: import.meta.env.PROD,
				httpOnly: true,
				maxAge: 60 * 5, // 5 minutes,
				sameSite: 'lax',
			});

			authUrl = client.createAuthorizationURL(state, codeVerifier, getScopes(oauthConfig));
		} else {
			authUrl = client.createAuthorizationURL(state, getScopes(oauthConfig));
		}

		// Add login hint if email is present, to speed up login
		if (loginHint) {
			authUrl.searchParams.set('login_hint', loginHint);
		}

		// Determine if we need to prompt the user to reauthorize the scopes
		// If there is the reauthorize param, we were redirected after logging in.
		if (reauthorize) {
			authUrl.searchParams.set('prompt', 'consent');
		}
		// If prompt parameter is explicitly passed, use it
		else if (prompt) {
			authUrl.searchParams.set('prompt', prompt);
		}
		// If the account is an error state or the tokens are expired we need to do so.
		else if (currentAccount) {
			if (await accountNeedsReauthorization(currentAccount)) {
				authUrl.searchParams.set('prompt', 'consent');
			}
		}

		return redirect(authUrl.toString());
	} catch (error) {
		logger.warn({ error }, 'OAuth authorization failed');
		return new Response('OAuth initialization failed', { status: 500 });
	}
}

function getScopes(oauth: OAuthConfig) {
	return oauth.scopes ?? [];
}
