import { os } from '@orpc/server';
import { analyzeThreadHighlights } from '@workspace/ai';
import { logger } from '@workspace/core/logger.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';
import { getThreadDetails } from '../pages/api/prompt/[id].ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

export const actions = {
	getHighlights: defineORPCAction
		.input(z.object({ threadId: z.string() }))
		.handler(async ({ input, context }) => {
			try {
				const { threadId } = input;
				const currentAccount = await getActiveAccountOrThrow(context);
				const threadDetails = await getThreadDetails(threadId, currentAccount);
				const result = await analyzeThreadHighlights(threadDetails, currentAccount);
				return { highlights: result.highlights };
			} catch (error) {
				logger.error({ error }, 'Error getting highlights');
				throw error;
			}
		}),
};
