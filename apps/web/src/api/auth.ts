import { ORPCError, os } from '@orpc/server';
import { db } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import {
	createRefreshJWT,
	createSessionAndRefreshJWTsAndSetCookies,
	createSessionJWT,
	createUserData,
	deleteAllCookiesOnLogout,
	getActiveAccountOrThrow,
	getCurrentAccount,
} from '../lib/auth.ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();
const logger = baseLogger.child({
	component: 'actions/auth',
});

export const actions = {
	destroySession: defineORPCAction.input(z.object({})).handler(async ({ input, context }) => {
		const currentAccount = await getCurrentAccount(context);
		logger.info(
			{ accountId: currentAccount?.id ?? 'no current account', userId: currentAccount?.userId ?? 'no current user', loggingOut: true },
			'Destroying session cookies for account',
		);
		deleteAllCookiesOnLogout(context);
		return { ok: true };
	}),
	switchAccount: defineORPCAction
		.input(z.object({ accountId: z.string(), desktop: z.boolean() }))
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);
			const account = await db.query.account.findFirst({
				where: (account, { eq, and }) =>
					// Important, we only want to switch to accounts that belong to the current user
					and(eq(account.id, input.accountId), eq(account.userId, currentAccount.userId)),
			});
			if (!account) {
				throw new ORPCError('NOT_FOUND', { message: 'Account not found' });
			}

			const userData = createUserData(account.id, account.userId);

			if (input.desktop) {
				const session = await createSessionJWT(userData);
				const refresh = await createRefreshJWT(userData);
				return { ok: true, session, refresh };
			} else {
				await createSessionAndRefreshJWTsAndSetCookies(context, userData);

				return { ok: true };
			}
		}),
};
