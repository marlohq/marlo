import { analyzeAttachment } from '@workspace/ai';
import { db, eq, inArray, messageAttachment } from '@workspace/core/drizzle.js';
import { UnrecoverableError } from '@workspace/core/errors.js';
import { logger } from '@workspace/core/logger.js';
import type { Mail } from '@workspace/core/mail-parser.js';
import { createAttachmentHash, uploadAttachment } from '@workspace/core/storage/attachments.js';
import { APICallError, isRateLimitError } from '../../../ai/src/errors.ts';

export async function processMailAttachments(
	userId: string,
	accountId: string,
	messageId: string,
	messageRemoteId: string,
	attachments: Mail['attachments'],
) {
	const relevantAttachments = attachments
		.filter(
			(att): att is Mail['attachments'][number] & { contentId: string; filename: string } =>
				Boolean(att.contentId) && Boolean(att.filename),
		)
		.map((att) => ({
			...att,
			hash: createAttachmentHash(userId, messageRemoteId, att.contentId),
		}));

	// Early return if no relevant attachments
	if (relevantAttachments.length === 0) {
		return;
	}

	logger.debug(
		{ messageId, attachmentCount: relevantAttachments.length },
		'Processing attachments for message',
	);
	try {
		// Process all attachments - if any fail, we'll catch and mark all as failed
		for (const attachment of relevantAttachments) {
			const buffer =
				typeof attachment.content === 'string'
					? Buffer.from(attachment.content, 'base64')
					: Buffer.from(attachment.content);

			const uploadResult = await uploadAttachment(
				accountId,
				attachment.hash,
				buffer,
				attachment.contentType,
			);
			logger.debug({ uploadResult, attachmentHash: attachment.hash }, 'Uploaded attachment');

			// We only support PDFs for analysis now
			if (attachment.contentType === 'application/pdf') {
				try {
					const markdown = await analyzeAttachment(buffer);

					await db
						.update(messageAttachment)
						.set({
							status: 'COMPLETED',
							content: markdown,
						})
						.where(eq(messageAttachment.hash, attachment.hash));
				} catch (error) {
					// Special case for rate limiting - propagate this up immediately
					if (isRateLimitError(error)) {
						return {
							status: 'rate-limited' as const,
							error: error,
						};
					}

					if (APICallError.isInstance(error)) {
						if (!error.isRetryable) {
							throw new UnrecoverableError(error.message);
						}
					}

					throw error;
				}
			} else
				await db
					.update(messageAttachment)
					.set({
						status: 'COMPLETED',
						content: null,
					})
					.where(eq(messageAttachment.hash, attachment.hash));
		}
	} catch (error) {
		// Mark all attachments as failed in a single query
		if (relevantAttachments.length > 0) {
			await db
				.update(messageAttachment)
				.set({ status: 'FAILED' })
				.where(
					inArray(
						messageAttachment.hash,
						relevantAttachments.map((att) => att.hash),
					),
				);
		}

		// Re-throw the error for the caller to handle
		throw error;
	}
}
