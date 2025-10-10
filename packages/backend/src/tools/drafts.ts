import { type Account, db, draft, message, messageRecipient } from '@workspace/core/drizzle.js';
import { createId } from '@workspace/core/util.js';
import { tool } from 'ai';
import { z } from 'zod';

function parseEmailAddress(emailString: string): { name?: string; addr: string } {
	// Parse formats like "John Doe <john@example.com>" or "john@example.com"
	const match = emailString.match(/^(.+?)\s*<(.+?)>$|^(.+)$/);
	if (match) {
		if (match[1] && match[2]) {
			return { name: match[1].trim(), addr: match[2].trim() };
		} else if (match[3]) {
			return { addr: match[3].trim() };
		}
	}
	return { addr: emailString.trim() };
}

/** Create draft tool - creates a local draft email in response to a thread */
export function createDraftTool(account: Account) {
	return tool({
		description:
			'Create a draft email in response to a thread. The draft will be saved locally and can be edited or sent later.',
		inputSchema: z.object({
			threadId: z.string().describe('The ID of the thread to reply to'),
			subject: z.string().describe('The subject line of the draft email'),
			body: z.string().describe('The HTML content of the draft email'),
			to: z
				.array(z.string())
				.describe(
					'Array of recipient email addresses (can include names like "John Doe <john@example.com>")',
				),
			cc: z.array(z.string()).optional().describe('Array of CC email addresses').default([]),
			bcc: z.array(z.string()).optional().describe('Array of BCC email addresses').default([]),
		}),
		execute: async ({ threadId, subject, body, to, cc = [], bcc = [] }) => {
			try {
				// Parse email addresses
				const parsedTo = to.map(parseEmailAddress);
				const parsedCc = cc.map(parseEmailAddress);
				const parsedBcc = bcc.map(parseEmailAddress);

				// Get the thread to verify it exists and get context
				const thread = await db.query.thread.findFirst({
					where: (thread, { eq }) => eq(thread.id, threadId),
					with: {
						messages: {
							orderBy: (messages, { desc }) => [desc(messages.sentAt)],
							limit: 1,
						},
					},
				});

				if (!thread) {
					return {
						success: false,
						error: 'Thread not found',
					};
				}

				const latestMessage = thread.messages[0];
				const inReplyTo = latestMessage?.remoteId || null;

				// Create the draft and message
				const draftId = createId();
				const messageId = createId();
				const now = new Date();

				// Create message record
				await db.transaction(async (tx) => {
					// Insert the message
					await tx.insert(message).values({
						id: messageId,
						userId: account.userId,
						accountId: account.id,
						threadId: threadId,
						draftId: draftId,
						remoteId: `ZZ${messageId}`, // Local optimistic ID
						globalId: `ZZ${messageId}`,
						subject: subject,
						contentHtml: body,
						contentText: body, // Could be improved with HTML to text conversion
						snippet: body.substring(0, 100),
						senderName: account.name,
						senderEmail: account.email,
						inReplyTo: inReplyTo,
						sentAt: now,
						readAt: null,
						deletedAt: null,
						createdAt: now,
						updatedAt: now,
					});

					// Insert recipients
					const recipients = [
						...parsedTo.map((addr) => ({
							id: createId(),
							messageId,
							email: addr.addr,
							name: addr.name || null,
							type: 'TO' as const,
						})),
						...parsedCc.map((addr) => ({
							id: createId(),
							messageId,
							email: addr.addr,
							name: addr.name || null,
							type: 'CC' as const,
						})),
						...parsedBcc.map((addr) => ({
							id: createId(),
							messageId,
							email: addr.addr,
							name: addr.name || null,
							type: 'BCC' as const,
						})),
					];

					if (recipients.length > 0) {
						await tx.insert(messageRecipient).values(recipients);
					}

					// Create the draft record
					await tx.insert(draft).values({
						id: draftId,
						userId: account.userId,
						accountId: account.id,
						messageId: messageId,
						threadId: threadId,
						remoteId: `ZZ${draftId}`, // Local optimistic ID
						deletedAt: null,
						createdAt: now,
						updatedAt: now,
					});
				});

				return {
					success: true,
					draftId: draftId,
					messageId: messageId,
					message: `Created draft reply in thread ${thread.id} with subject "${subject}"`,
				};
			} catch (error) {
				return {
					success: false,
					error: `Failed to create draft: ${error instanceof Error ? error.message : 'Unknown error'}`,
				};
			}
		},
	});
}
