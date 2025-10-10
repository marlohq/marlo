import { os } from '@orpc/server';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { syncActionsSchema, syncWithRemote } from '@workspace/core/remote-sync.ts';
import { fetchMessageContent } from '@workspace/google/mail-ingestion/content.ts';
import { getGmailClientForAccount } from '@workspace/google/request-client.ts';
import type { APIContext } from 'astro';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';
import { search } from '../lib/google.ts';

const logger = baseLogger.child({ namespace: 'google' });

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

export const actions = {
	search: defineORPCAction
		.input(
			z.object({
				query: z.string(),
				token: z.string().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { query, token } = input;
			const currentAccount = await getActiveAccountOrThrow(context);
			const { client: gmail } = await getGmailClientForAccount(currentAccount);
			invariant(gmail, 'Gmail tokens expired');
			const { results, nextPageToken } = await search(query, gmail, token);
			return { results: results.map((thread) => thread.id).filter(Boolean), nextPageToken };
		}),

	sync: defineORPCAction
		.input(
			z.object({
				action: syncActionsSchema,
				remoteThreadIds: z.array(z.string()),
			}),
		)
		.handler(async ({ input, context }) => {
			const { action, remoteThreadIds } = input;
			const currentAccount = await getActiveAccountOrThrow(context);
			await syncWithRemote({ action, accountId: currentAccount.id, remoteThreadIds });
		}),

	fetchContent: defineORPCAction
		.input(
			z.object({
				remoteId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const { remoteId } = input;
			const currentAccount = await getActiveAccountOrThrow(context);
			try {
				return await fetchMessageContent(currentAccount, remoteId);
			} catch (error) {
				logger.error({ error, remoteId }, 'Error fetching message content');
				throw error;
			}
		}),
};
