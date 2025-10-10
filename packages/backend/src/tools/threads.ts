import { type Account, db, eq, thread as threadTable } from '@workspace/core/drizzle.js';
import { tool } from 'ai';
import { z } from 'zod';

/** Resolve thread tool - marks a thread as resolved */
export function createResolveThreadTool(account: Account) {
	return tool({
		description:
			'Mark an email thread as resolved. This moves the thread out of the inbox and marks it as completed.',
		inputSchema: z.object({
			threadId: z.string().describe('The ID of the thread to resolve'),
			resolved: z
				.boolean()
				.default(true)
				.describe('Whether to resolve (true) or unresolve (false) the thread'),
		}),
		execute: async ({ threadId, resolved }) => {
			try {
				// Get the thread to verify it exists and belongs to this account
				const thread = await db.query.thread.findFirst({
					where: (thread, { eq, and }) =>
						and(eq(thread.id, threadId), eq(thread.accountId, account.id)),
					columns: {
						id: true,
						remoteId: true,
						resolvedAt: true,
					},
				});

				if (!thread) {
					return JSON.stringify({
						success: false,
						error: 'Thread not found',
					});
				}

				// Check if thread is already in the desired state
				const isCurrentlyResolved = !!thread.resolvedAt;
				if (isCurrentlyResolved === resolved) {
					return JSON.stringify({
						success: true,
						message: `Thread is already ${resolved ? 'resolved' : 'unresolved'}`,
						threadId,
						resolved,
					});
				}

				const now = new Date();

				// Update the thread resolution status
				await db
					.update(threadTable)
					.set({
						resolvedAt: resolved ? now : null,
						// When resolving, clear trash and spam status (following existing pattern)
						trashedAt: resolved ? null : undefined,
						spammedAt: resolved ? null : undefined,
						triagedAt: now, // Always update triaged timestamp
						updatedAt: now,
					})
					.where(eq(threadTable.id, threadId));

				return JSON.stringify({
					success: true,
					message: `Thread ${resolved ? 'resolved' : 'unresolved'} successfully`,
					threadId,
					resolved,
					resolvedAt: resolved ? now.toISOString() : null,
				});
			} catch (error) {
				return JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : 'Failed to resolve thread',
					threadId,
				});
			}
		},
	});
}
