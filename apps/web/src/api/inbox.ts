import { os } from '@orpc/server';
import {
	analyzeBundleSummary,
	guessChatTitle,
	guessQueryPurpose,
	serializeDetailedThread,
} from '@workspace/ai';
import { db } from '@workspace/core/drizzle.js';
import type { APIContext } from 'astro';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

export const actions = {
	analyzeQuery: defineORPCAction
		.input(
			z.object({
				q: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const result = await guessQueryPurpose(input.q);
			return { ok: true, result: result };
		}),

	analyzeChatTitle: defineORPCAction
		.input(
			z.object({
				message: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			const result = await guessChatTitle(input.message);
			return { ok: true, result: result.text.trim() };
		}),

	analyzeBundleSummary: defineORPCAction
		.input(
			z.object({
				threads: z.array(z.string()),
				title: z.string(),
				type: z.enum(['sender', 'category']),
			}),
		)
		.handler(async ({ input, context }) => {
			const currentAccount = await getActiveAccountOrThrow(context);
			const threads = await db.query.thread.findMany({
				where: (thread, { eq, and, inArray }) =>
					and(eq(thread.accountId, currentAccount.id), inArray(thread.id, input.threads)),
				columns: {
					id: true,
					lastSentAt: true,
					resolvedAt: true,
				},
				with: {
					messages: {
						columns: {
							senderEmail: true,
							senderName: true,
							subject: true,
							contentText: true,
							contentHtml: true,
							extractedContent: true,
							deletedAt: true,
							sentAt: true,
							draftId: true,
						},
						with: {
							messageRecipients: true,
						},
						orderBy: (message, { desc }) => [desc(message.sentAt)],
					},
				},
				limit: 32,
			});
			const threadData = threads
				.map((thread) => ({
					...thread,
					messages: thread.messages.map((msg) => ({
						...msg,
						recipients: msg.messageRecipients,
					})),
				}))
				.map((t) => serializeDetailedThread(t));
			const result = await analyzeBundleSummary(
				threadData,
				input.title,
				input.type,
				currentAccount,
			);
			return { ok: true, result: result.highlights };
		}),
};
