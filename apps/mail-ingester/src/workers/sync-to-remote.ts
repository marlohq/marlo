import { db, draft, eq, label, message, thread } from '@workspace/core/drizzle.ts';
import { env } from '@workspace/core/env.js';
import { INBOX_LABEL_ID, SPAM_LABEL_ID, UNREAD_LABEL_ID } from '@workspace/core/labels.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { type Job, UnrecoverableError, Worker } from '@workspace/core/queue-exports.js';
import type { SyncActionData } from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import { modifyRemoteLabels } from '@workspace/google/labels.js';
import { sendGmailMessage } from '@workspace/google/mail-ingestion/gmail-calls.js';
import { consumeMessage } from '@workspace/google/mail-ingestion/ingest.js';
import type { SendEmailWorkerJobData } from '@workspace/google/mail-ingestion/send.js';
import { getGmailClientForAccount } from '@workspace/google/request-client.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const logger = baseLogger.child({ namespace: 'mail-ingester:queues:remote-sync' });

const SEND_EMAIL_CONCURRENCY = 10;

export const syncActionToRemoteWorker = new Worker(
	'sync-action-to-remote',
	async (job: Job<SyncActionData>) => {
		const { action, accountId, remoteMessageId, remoteThreadId } = job.data;

		const account = await db.query.account.findFirst({
			where: (account, { eq }) => eq(account.id, accountId),
		});

		invariant(account, 'Account is required for syncing actions to remote');

		if (account.status !== 'ACTIVE') {
			if (account.errorCode === 'internal_failure') {
				throw new Error(`Google auth encountered an error, retrying later`);
			}

			logger.warn(
				{
					accountId: account.id,
					email: account.email,
					errorCode: account.errorCode,
				},
				'Account is not active, skipping sync action to remote',
			);

			return;
		}

		const { client: gmail, error } = await getGmailClientForAccount(account);

		if (error) {
			throw new Error(`Failed to get Gmail client for account, unauthenticated.`);
		}

		switch (action.id) {
			case 'label:create': {
				const userLabel = await db.query.label.findFirst({
					where: (label, { eq }) => eq(label.id, action.labelId),
				});
				invariant(userLabel, 'Label not found');

				const result = await gmail.users.labels.create({
					userId: 'me',
					requestBody: { name: userLabel.name },
				});

				invariant(result.data.id, 'Unexpected: Label ID is required');
				await db
					.update(label)
					.set({ remoteId: result.data.id })
					.where(eq(label.id, action.labelId));

				break;
			}
			case 'label:add': {
				const labelResult = await db.query.label.findFirst({
					where: (label, { eq }) => eq(label.id, action.labelId),
				});
				invariant(labelResult, 'Label not found');

				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [labelResult.remoteId],
					remove: [],
				});
				break;
			}
			case 'label:remove': {
				const labelToRemove = await db.query.label.findFirst({
					where: (label, { eq }) => eq(label.id, action.labelId),
				});
				invariant(labelToRemove, 'Label not found');

				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [],
					remove: [labelToRemove.remoteId],
				});

				break;
			}
			case 'trash:add': {
				await gmail.users.threads.trash({ userId: 'me', id: remoteThreadId });
				break;
			}
			case 'trash:remove': {
				await Promise.all([
					gmail.users.threads.untrash({ userId: 'me', id: remoteThreadId }),
					// Gmail's untrash API does not re-add the INBOX label, which is a bit unintuitive for end users as Gmail's UI does it, so we do it here.
					modifyRemoteLabels({
						gmail,
						remoteMessageId,
						remoteThreadId,
						add: [INBOX_LABEL_ID],
						remove: [],
					}),
				]);
				break;
			}
			case 'spam:add': {
				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [],
					remove: [INBOX_LABEL_ID],
				});
				break;
			}
			case 'spam:remove': {
				await Promise.all([
					modifyRemoteLabels({
						gmail,
						remoteMessageId,
						remoteThreadId,
						// Gmail's UI adds back the INBOX label when removing spam, so we do it here too.
						add: [INBOX_LABEL_ID],
						remove: [SPAM_LABEL_ID],
					}),
				]);
				break;
			}
			case 'unread:add': {
				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [UNREAD_LABEL_ID],
					remove: [],
				});
				break;
			}
			case 'unread:remove': {
				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [],
					remove: [UNREAD_LABEL_ID],
				});
				break;
			}
			case 'resolve:add': {
				// "Resolving", or more commonly known as Archiving in other clients is really just removing the INBOX label.
				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [],
					remove: [INBOX_LABEL_ID],
				});
				break;
			}
			case 'resolve:remove': {
				await modifyRemoteLabels({
					gmail,
					remoteMessageId,
					remoteThreadId,
					add: [INBOX_LABEL_ID],
					remove: [],
				});
				break;
			}
			default:
				throw new UnrecoverableError('Unknown sync action');
		}
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

// Setup error handlers for sync action to remote worker
setupWorkerErrorHandlers(syncActionToRemoteWorker, {
	getJobContext: (job) => {
		const { action, remoteMessageId, remoteThreadId } = job.data;
		return { action, remoteMessageId, remoteThreadId };
	},
	getErrorMessage: () => 'Failed to sync action to remote',
});

export const sendEmailWorker = new Worker(
	'sendEmailQueue',
	async (job: Job<SendEmailWorkerJobData>) => {
		const { accountId, messageId, encoded, remoteThreadId, draftId } = job.data;

		const messageRecord = messageId
			? await db.query.message.findFirst({ where: (fields, { eq }) => eq(fields.id, messageId) })
			: null;
		invariant(!(messageId && !messageRecord), `Temporary message with ID ${messageId} not found`);
		// We have to get the account separately from the message, because Drizzle does not correctly handle our binary types if we get account as part of the message query, weird.
		const account = await db.query.account.findFirst({
			where: (fields, { eq }) => eq(fields.id, accountId),
		});
		if (!account) {
			throw new UnrecoverableError(`Account with ID ${accountId} not found.`);
		}

		// The draft for this message, if there is one.
		const messageDraft = draftId
			? await db.query.draft.findFirst({
					where: (fields, { eq }) => eq(fields.id, draftId),
					with: {
						message: {
							columns: {
								remoteId: true,
							},
							with: {
								thread: {
									columns: {
										remoteId: true,
									},
								},
							},
						},
					},
				})
			: undefined;

		const { client: gmail, error } = await getGmailClientForAccount(account);
		invariant(!error, 'Failed to get Gmail client for account, unauthenticated.');

		// TODO: In theory, here we can send but fail the rest, we should have multiple steps here like mail ingestion
		logger.info(
			{
				userId: account.userId,
				accountId: account.id,
				remoteThreadId: remoteThreadId,
				draftId: draftId,
			},
			'Sending email to Gmail',
		);
		const sentMessage = await sendGmailMessage(gmail, encoded, remoteThreadId);

		const sentRemoteId = sentMessage.data.id;
		const sentRemoteThreadId = sentMessage.data.threadId;

		invariant(sentRemoteId, 'Expected sentMessage.data.id to be defined');
		invariant(sentRemoteThreadId, 'Expected sentMessage.data.threadId to be defined');

		// Update our previous temporary message with the actual remoteId
		if (messageRecord) {
			await db.transaction(async (tx) => {
				await tx
					.update(message)
					.set({
						remoteId: sentRemoteId,
						draftId: null, // Clear the draftId to convert to a regular message
					})
					.where(eq(message.id, messageRecord.id));

				await tx
					.update(thread)
					.set({
						remoteId: sentRemoteThreadId,
					})
					.where(eq(thread.id, messageRecord.threadId));

				if (messageDraft?.id) {
					// Mark the draft as deleted since the message has been sent
					await tx
						.update(draft)
						.set({
							deletedAt: new Date(),
						})
						.where(eq(draft.id, messageDraft.id));
				}
			});
		}

		logger.info(
			{
				userId: account.userId,
				accountId: account.id,
				remoteId: sentRemoteId,
				remoteThreadId: sentRemoteThreadId,
			},
			'Consuming sent message from Gmail',
		);
		await consumeMessage(account, sentRemoteId);

		logger.info(
			{
				userId: account.userId,
				accountId: account.id,
			},
			'Email sent successfully',
		);
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: SEND_EMAIL_CONCURRENCY,
	},
);

// Setup error handlers for send email worker
setupWorkerErrorHandlers(sendEmailWorker, {
	getJobContext: (job) => ({ messageId: job.data.messageId }),
	getErrorMessage: () => 'Failed to send email',
});
