import LRU from '@alloc/quick-lru';
import { os } from '@orpc/server';
import { assessEmailSecurity, isRateLimitError } from '@workspace/ai';
import { db } from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import { parseMailDecoded } from '@workspace/core/mail-parser.js';
import { getMessage } from '@workspace/core/storage/raw.js';
import { type EmailAddress, send } from '@workspace/google/send.ts';
import type { APIContext } from 'astro';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { getActiveAccountOrThrow } from '../lib/auth.ts';

const defineORPCAction = os.$context<Pick<APIContext, 'locals' | 'cookies'>>();

// Cache security audit results for 24 hours. We could cache indefinitely, but we
// deploy often enough that this wouldn't matter.
const securityAuditLru = new LRU<string, { level: string; score: number; reasoning?: string }>({
	maxSize: 10000,
	maxAge: 1000 * 60 * 60 * 24,
});

const recipientInput = z.object({ addr: z.string(), name: z.string().nullable() });

const emailSchema = z.object({
	insertedId: z.string().optional(),
	sendAt: z.coerce.date().optional(),
	messageId: z.string().optional(),
	draftId: z.string().optional(),
	to: recipientInput.array(),
	cc: recipientInput.array(),
	bcc: recipientInput.array(),
	subject: z.string().or(z.null()),
	body: z.string().or(z.null()),
	attachments: z.array(z.instanceof(File)),
});

export const actions = {
	send: defineORPCAction.input(emailSchema).handler(async ({ input, context }) => {
		const { draftId, messageId, sendAt, insertedId, subject, to, cc, bcc, body, attachments } =
			input;
		const currentAccount = await getActiveAccountOrThrow(context);

		let message = null;
		if (messageId) {
			message = await db.query.message.findFirst({
				where: (message, { eq }) => eq(message.id, messageId),
				with: { thread: true },
			});
			invariant(message, 'Message not found');
		}

		invariant(sendAt, 'sendAt is required');
		invariant(insertedId, 'insertedId is required');

		function mapRecipientToEmailAddress(r: z.infer<typeof recipientInput>): EmailAddress {
			return { addr: r.addr, name: r.name ?? undefined };
		}

		return await send({
			sendAt,
			accountId: currentAccount.id,
			insertedId,
			draftId,
			remoteThreadId: message?.thread.remoteId,
			email: {
				from: {
					name: currentAccount.name,
					addr: currentAccount.email,
				},
				to: to.map(mapRecipientToEmailAddress),
				cc: cc.map(mapRecipientToEmailAddress),
				bcc: bcc.map(mapRecipientToEmailAddress),
				subject: subject || '',
				body: body || '',
				attachments: await Promise.all(attachments.map(convertFileToAttachment)),
				headers: {
					...(message?.globalId ? { References: message.globalId } : {}),
					...(message?.globalId ? { 'In-Reply-To': message.globalId } : {}),
				},
			},
		});
	}),
	audit: defineORPCAction
		.input(
			z.object({
				threadId: z.string(),
			}),
		)
		.handler(async ({ input, context }) => {
			try {
				const { threadId } = input;
				const currentAccount = await getActiveAccountOrThrow(context);

				// Get all messages in the thread
				const thread = await db.query.thread.findFirst({
					where: (thread, { eq }) => eq(thread.id, threadId),
					with: {
						messages: {
							where: (message, { isNull }) => isNull(message.deletedAt),
							orderBy: (message, { asc }) => [asc(message.sentAt)],
						},
					},
				});
				invariant(thread, 'Thread not found');
				invariant(thread.messages.length > 0, 'No messages in thread');

				const cacheKey = `${currentAccount.id}-${threadId}`;
				const cached = securityAuditLru.get(cacheKey);
				if (cached) {
					return { ok: true, cached: true, ...cached };
				}

				try {
					// Get raw content for all messages in thread
					const messageContents = [];
					for (const message of thread.messages) {
						const stream = await getMessage(currentAccount.id, message.remoteId);
						if (stream) {
							const raw = await new Response(stream).text();
							const parsedMail = await parseMailDecoded(raw);
							messageContents.push({
								messageId: message.id,
								sentAt: message.sentAt,
								senderEmail: message.senderEmail,
								subject: message.subject,
								headers: JSON.stringify(parsedMail.headers),
								body: parsedMail.html || parsedMail.text || '',
							});
						}
					}

					// Use AI to assess thread security
					const assessment = await assessEmailSecurity({
						threadId,
						messages: messageContents,
					});

					const result = {
						level: assessment.level.toLowerCase(),
						score: assessment.score,
						reasoning: assessment.reasoning,
					};
					securityAuditLru.set(cacheKey, result);
					return { ok: true, cached: false, ...result };
				} catch (error) {
					// Handle rate limiting
					if (isRateLimitError(error)) {
						// Return a temporary "unknown" result for rate limited requests
						return { ok: false, error: 'Rate limited', level: 'unknown', score: 0 };
					}
					throw error;
				}
			} catch (error) {
				logger.error({ error }, 'Error auditing thread security');
				throw error;
			}
		}),
};

async function convertFileToAttachment(file: File): Promise<{
	filename: string;
	data: Buffer;
	contentType: string;
}> {
	return {
		filename: file.name,
		data: Buffer.from(await file.arrayBuffer()),
		contentType: file.type,
	};
}
