import { os } from '@orpc/server';
import { db, desc, eq, spaceActionRun } from '@workspace/core/drizzle.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

export const actions = {
	getActionRuns: defineORPCAction
		.input(
			z.object({
				actionId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);

			// First verify the action belongs to the current account and get space info
			const action = await db.query.spaceAction.findFirst({
				where: (spaceAction, { eq, and }) =>
					and(eq(spaceAction.id, input.actionId), eq(spaceAction.accountId, currentAccount.id)),
				with: {
					space: {
						columns: {
							id: true,
							name: true,
						},
					},
				},
			});

			if (!action) {
				throw new Error('Action not found or access denied');
			}

			// Fetch the runs for this action
			const runs = await db.query.spaceActionRun.findMany({
				where: eq(spaceActionRun.actionId, input.actionId),
				orderBy: [desc(spaceActionRun.startedAt)],
				limit: 50, // Limit to 50 most recent runs
			});

			return { ok: true, runs, space: action.space };
		}),
};
