import { serializeDetailedThread, serializeReferenceThread } from '@workspace/ai';
import { type Account, db } from '@workspace/core/drizzle.js';
import type { GmailClient } from '@workspace/google/request-client.ts';
import { tool } from 'ai';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { search } from '../../../../apps/web/src/lib/google.js';

/** Search tool - searches the user's mailbox using Gmail API */
export function createSearchTool(gmail: GmailClient, account: Account) {
	return tool({
		description:
			"Search the user's mailbox for emails matching a query. Returns a list of matching email threads with basic information.",
		inputSchema: z.object({
			q: z
				.string()
				.describe(
					'The search query to find emails. Use Gmail search syntax (e.g., "from:john", "subject:meeting", "label:important")',
				),
		}),
		execute: async ({ q }) => {
			const { results } = await search(q, gmail);
			const remoteIds = results.map((t) => t.id).filter((s) => s != null);

			if (remoteIds.length === 0) {
				return '';
			}

			const threads = await db.query.thread.findMany({
				limit: 25,
				where: (thread, { eq, and, inArray }) =>
					and(inArray(thread.remoteId, remoteIds), eq(thread.accountId, account.id)),
				columns: {
					id: true,
					lastSentAt: true,
					resolvedAt: true,
				},
				with: {
					messages: {
						limit: 1,
						columns: {
							senderEmail: true,
							senderName: true,
							subject: true,
							snippet: true,
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
				orderBy: (thread, { desc }) => [desc(thread.lastSentAt)],
			});

			return threads
				.map((thread) => ({
					...thread,
					messages: thread.messages
						.filter((msg) => !msg.deletedAt)
						.map((msg) => ({
							...msg,
							recipients: msg.messageRecipients,
						})),
				}))
				.map(serializeReferenceThread)
				.map((t) => `<email>${t}</email>`)
				.join('\n');
		},
	});
}

/** Get thread details tool - retrieves full thread content including all messages */
export function createGetThreadDetailsTool(account: Account) {
	return tool({
		description:
			'Get the full details of an email thread including all messages and their content. Use this when you need to read the actual email content.',
		inputSchema: z.object({
			threadId: z.string().describe('The ID of the email thread to retrieve details for'),
		}),
		execute: async ({ threadId }) => {
			const thread = await db.query.thread.findFirst({
				where: (thread, { eq, and }) =>
					and(eq(thread.id, threadId), eq(thread.accountId, account.id)),
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
							extractedContent: true,
							contentText: true,
							contentHtml: true,
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
			});

			invariant(thread, 'Thread not found');

			// Transform the data to match expected structure
			const transformedThread = {
				...thread,
				messages: thread.messages
					.filter((msg) => !msg.deletedAt)
					.map((msg) => ({
						...msg,
						recipients: msg.messageRecipients,
					})),
			};

			return serializeDetailedThread(transformedThread);
		},
	});
}
