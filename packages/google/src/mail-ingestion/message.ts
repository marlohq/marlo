import { and, count, db, eq, message, messageAttachment, thread } from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { deleteAttachment } from '@workspace/core/storage/attachments.js';
import { deleteMessage as deleteRawMessage } from '@workspace/core/storage/raw.js';

const logger = baseLogger.child({ namespace: 'google:ingest' });

export async function deleteMessage({
	remoteMessageId,
	remoteThreadId,
	accountId,
	userId,
	tx,
}: {
	remoteMessageId: string;
	remoteThreadId: string;
	userId: string;
	accountId: string;
	tx?: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
	if (tx) {
		await deleteMessageFromDb({
			remoteMessageId,
			remoteThreadId,
			accountId,
			userId,
			tx,
		});
	} else {
		await db.transaction(async (tx) => {
			await deleteMessageFromDb({
				remoteMessageId,
				remoteThreadId,
				accountId,
				userId,
				tx,
			});
		});
	}
}

async function deleteMessageFromDb({
	remoteMessageId,
	remoteThreadId,
	accountId,
	userId,
	tx,
}: {
	remoteMessageId: string;
	remoteThreadId: string;
	userId: string;
	accountId: string;
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
	// Find and delete the message
	const messagesToDelete = await tx
		.select()
		.from(message)
		.where(and(eq(message.accountId, accountId), eq(message.remoteId, remoteMessageId)));

	if (messagesToDelete.length === 0) {
		logger.warn({ userId, accountId, remoteMessageId }, 'Message not found for deletion');
		return;
	}

	const deletedMessage = messagesToDelete[0];
	if (!deletedMessage) {
		logger.warn({ userId, accountId, remoteMessageId }, 'Message not found for deletion');
		return;
	}

	await tx
		.delete(message)
		.where(and(eq(message.accountId, accountId), eq(message.remoteId, remoteMessageId)));

	logger.info({ userId, accountId, remoteMessageId }, 'Message deleted');

	// Find and delete attachments
	const attachments = await tx
		.select()
		.from(messageAttachment)
		.where(eq(messageAttachment.messageId, deletedMessage.id));

	for (const attachment of attachments) {
		await tx
			.delete(messageAttachment)
			.where(eq(messageAttachment.id, attachment.id))
			.then(
				() => {
					logger.info({ userId, accountId, remoteMessageId }, 'Attachment deleted');
				},
				() => {
					logger.warn({ attachmentId: attachment.id }, 'Attachment not found for deletion');
				},
			);
		await deleteAttachment(accountId, attachment.hash);
	}

	// Find the thread
	const threads = await tx
		.select({ id: thread.id })
		.from(thread)
		.where(and(eq(thread.accountId, accountId), eq(thread.remoteId, remoteThreadId)));

	if (threads.length === 0) {
		logger.warn(
			{ userId, accountId, remoteThreadId },
			'Google: thread not found for deletion of message',
		);
		return;
	}

	const threadRecord = threads[0];
	if (!threadRecord) {
		logger.warn(
			{ userId, accountId, remoteThreadId },
			'Google: thread not found for deletion of message',
		);
		return;
	}

	// Check remaining messages in thread
	const remainingMessagesCount = await tx
		.select({ count: count() })
		.from(message)
		.where(eq(message.threadId, threadRecord.id));

	const messageCount = remainingMessagesCount[0]?.count ?? 0;

	if (messageCount === 0) {
		await tx
			.update(thread)
			.set({
				// Soft delete the thread
				deletedAt: new Date(),
			})
			.where(eq(thread.id, threadRecord.id))
			.then(
				() => {
					logger.info({ userId, accountId, remoteThreadId }, 'Thread deleted');
				},
				() => {
					logger.warn({ threadId: threadRecord.id }, 'Thread not found for deletion');
				},
			);
	}

	// Delete raw message from the bucket
	await deleteRawMessage(accountId, remoteMessageId).catch((error) => {
		logger.error({ userId, accountId, remoteMessageId, error }, 'Failed to delete raw message');
	});
}
