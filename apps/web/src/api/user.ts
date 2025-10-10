import { os } from '@orpc/server';
import { account, db, eq, user } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { deleteAllAccountObjects } from '@workspace/core/storage/storage.js';
import { send } from '@workspace/google/send.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { deleteAllCookiesOnLogout, getActiveAccountOrThrow } from '../lib/auth.js';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();
const logger = baseLogger.child({
	component: 'actions/user',
});

const getInviteBody = () => `
<html><head></head><body>I&#39;m excited to share an invite to Marlo, the intelligent email app for busy people.
<br/><br/>
Marlo was designed to rethink email for the modern, AI-first era.
<br/>
You&#39;ll fly through your inbox, respond faster to what matters, and save 4+ hours every week.
<br/><br/>
<a href="https://marlo.so/">Click here</a> to get started with Marlo.
<br/><br/>
I&#39;ve cc&#39;ed Fred from the Marlo team to help :)
</body></html>
`;

export const actions = {
	inviteUser: defineORPCAction
		.input(z.object({ email: z.string().email() }))
		.handler(async ({ input, context }) => {
			const { email } = input;
			const currentAccount = await getActiveAccountOrThrow(context);

			await send({
				sendAt: new Date(Date.now()),
				accountId: currentAccount.id,
				email: {
					from: {
						name: currentAccount.name,
						addr: currentAccount.email,
					},
					to: [{ addr: email }],
					cc: [{ addr: 'fred@marlo.so' }],
					subject: `Marlo Invite (from ${currentAccount.name})`,
					body: getInviteBody(),
					attachments: [],
					headers: {},
				},
			});

			return { ok: true } as const;
		}),
	deleteAccount: defineORPCAction
		.input(z.object({}) /* no arguments */)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);

			await deleteAccount(currentAccount.id);

			logger.info(
				{ accountId: currentAccount.id, userId: currentAccount.userId, loggingOut: true },
				'Deleting account',
			);
			deleteAllCookiesOnLogout(context);

			return {
				ok: true,
			};
		}),
	deleteAllUserDataYesReally: defineORPCAction
		.input(z.object({}) /* no arguments */)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);
			const userId = currentAccount.userId;

			await deleteUser(userId);

			logger.info(
				{ accountId: currentAccount.id, userId: currentAccount.userId, loggingOut: true },
				'Deleting all user data',
			);
			deleteAllCookiesOnLogout(context);

			return {
				ok: true,
			};
		}),
};

async function deleteAccount(accountId: string) {
	await deleteAllAccountObjects(accountId);

	await db.delete(account).where(eq(account.id, accountId));
}

export async function deleteUser(userId: string) {
	const accounts = await db.query.account.findMany({
		where: (account, { eq }) => eq(account.userId, userId),
		columns: {
			id: true,
		},
	});

	await Promise.all(
		accounts.map(async (account) => {
			deleteAllAccountObjects(account.id);
		}),
	);

	await db.delete(user).where(eq(user.id, userId));
}
