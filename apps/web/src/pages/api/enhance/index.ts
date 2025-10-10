import { simpleEnhance } from '@workspace/ai';
import {
	and,
	db,
	desc,
	eq,
	exists,
	inArray,
	isNull,
	message,
	messageRecipient,
	not,
	notExists,
} from '@workspace/core/drizzle.js';
import type { APIRoute } from 'astro';
import { invariant } from 'es-toolkit';
import { z } from 'zod';
import { getCurrentAccountOrThrow } from '../../../lib/auth.ts';

const enhanceRequestSchema = z.object({
	draftMessageId: z.string(),
	content: z.string(),
});

export const POST: APIRoute = async ({ request, locals }) => {
	const currentAccount = await getCurrentAccountOrThrow({ locals });
	const raw = await request.json();
	const enhanceRequest = enhanceRequestSchema.safeParse(raw);
	if (!enhanceRequest.success) {
		return new Response(JSON.stringify({ error: enhanceRequest.error.message }), { status: 400 });
	}

	const { draftMessageId, content } = enhanceRequest.data;

	async function getDraftMessage(draftMessageId: string) {
		const draftMessage = await db.query.message.findFirst({
			where: (message, { eq }) => eq(message.id, draftMessageId),
			with: {
				messageRecipients: true,
			},
		});
		invariant(draftMessage, 'Draft message not found');
		return draftMessage;
	}

	async function getRecentMessagesBetweenSender(recipientEmails: string[]) {
		const messages = await db
			.select({
				contentHtml: message.contentHtml,
				sentAt: message.sentAt,
				subject: message.subject,
			})
			.from(message)
			.where(
				and(
					not(eq(message.id, draftMessageId)),
					isNull(message.deletedAt),
					isNull(message.draftId),
					exists(
						db
							.select()
							.from(messageRecipient)
							.where(
								and(
									eq(messageRecipient.messageId, message.id),
									inArray(messageRecipient.email, recipientEmails),
								),
							),
					),
					notExists(
						db
							.select()
							.from(messageRecipient)
							.where(
								and(
									eq(messageRecipient.messageId, message.id),
									not(inArray(messageRecipient.email, recipientEmails)),
								),
							),
					),
				),
			)
			.orderBy(desc(message.sentAt))
			.limit(10);

		if (messages.length === 0) {
			return null;
		} else {
			return JSON.stringify(messages);
		}
	}

	const draftMessage = await getDraftMessage(draftMessageId);
	const recipients = draftMessage?.messageRecipients.map((r) => r.email);
	const recentMessages = recipients.length
		? await getRecentMessagesBetweenSender(recipients)
		: null;

	const response = simpleEnhance({
		fullDraft: draftMessage.contentHtml ?? 'No saved draft content found.',
		content,
		recentMessages,
	});

	return response;
};
