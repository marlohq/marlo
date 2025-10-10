import type { ScoreEventType } from '@workspace/core/contact-score.js';
import type {
	IngestFromEmailJobData,
	UpdateContactScoreJobData,
} from '@workspace/core/contacts.js';
import { db } from '@workspace/core/drizzle.ts';
import { env } from '@workspace/core/env.js';
import { SPAM_LABEL_ID, STARRED_LABEL_ID } from '@workspace/core/labels.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import {
	FlowProducer,
	type Job,
	type JobPro,
	WaitingChildrenError,
	Worker,
} from '@workspace/core/queue-exports.js';
import {
	aiQueue,
	enqueueFilterForSpace,
	enqueueTagMessage,
	enqueueUpdateInferredContactProfile,
	FilterForSpaceStep,
	type MailIngestionJobData,
	MailIngestionStep,
	mailProcessQueue,
} from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import { GoogleRateLimitError } from '@workspace/google/errors.js';
import { consumeMessageImport } from '@workspace/google/mail-ingestion/bulk-import.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const MAIL_INGESTION_CONCURRENCY = 50;

const logger = baseLogger.child({ namespace: 'mail-ingester:queues' });

const flowProducer = new FlowProducer({
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

/** Queue contact score updates based on message import data */
async function queueContactScoreUpdates(
	messageImport: Awaited<ReturnType<typeof consumeMessageImport>>,
	job: Job<MailIngestionJobData>,
	userId: string,
	accountId: string,
) {
	if (!messageImport) return;
	invariant(job.id, 'Job ID should be defined');

	const contactsToScore: { email: string; name?: string | null; events: ScoreEventType[] }[] = [];

	const isFromAccount = messageImport.fromEmail === messageImport.accountEmail;

	// If the message doesn't come from us, check it for spam and other signals
	if (!isFromAccount) {
		const events: ScoreEventType[] = [];

		if (messageImport.remoteLabelIds.includes(SPAM_LABEL_ID)) {
			events.push('SENT_SPAM');
		}

		if (messageImport.remoteLabelIds.includes(STARRED_LABEL_ID)) {
			events.push('STAR');
		}

		// Always ingest fromEmail, even if there are no scoring events
		contactsToScore.push({
			email: messageImport.fromEmail,
			name: messageImport.fromName,
			events,
		});
	} else {
		const inReplyToId = messageImport.inReplyTo;

		// When the message is from us and it's the first in the thread, aka has the same message and thread ID
		// Queue a score update for the people we've sent the message to
		if (messageImport.remoteMessageId === messageImport.remoteThreadId) {
			for (const recipient of messageImport.parsedMail.to) {
				const recipientEmail = recipient.address;
				const recipientName = recipient.name;

				if (recipientEmail) {
					contactsToScore.push({
						email: recipientEmail,
						name: recipientName,
						events: ['INITIATED_WITH'],
					});
				}
			}
		}

		if (inReplyToId) {
			const originalMessage = await db.query.message.findFirst({
				where: (fields, { eq, and }) =>
					and(eq(fields.accountId, accountId), eq(fields.globalId, inReplyToId)),
				columns: {
					senderEmail: true,
					senderName: true,
				},
			});

			// If we replied to someone other than ourselves, give them points. It's okay here if we don't find the original message
			// It's not an exact science, so better to give points when we can rather than miss out
			if (originalMessage && originalMessage.senderEmail !== messageImport.accountEmail) {
				// Give points to the person we replied to
				contactsToScore.push({
					email: originalMessage.senderEmail,
					name: originalMessage.senderName,
					events: ['REPLIED_TO'],
				});
			}
		}
	}

	for (const contact of contactsToScore) {
		await flowProducer.add({
			name: 'update-contact-score',
			queueName: 'contact-ingestion',
			data: {
				email: contact.email,
				userId,
				accountId,
				events: contact.events,
			} satisfies UpdateContactScoreJobData,
			opts: {
				parent: {
					id: job.id,
					queue: job.queueQualifiedName,
				},
				group: {
					id: accountId,
				},
			},
			children: [
				{
					name: 'ingest-from-email',
					queueName: 'contact-ingestion',
					data: {
						userId,
						accountId,
						email: contact.email,
						name: contact.name ?? undefined,
					} satisfies IngestFromEmailJobData,
					opts: {
						group: {
							id: accountId,
						},
					},
				},
			],
		});
	}

	return contactsToScore.length > 0;
}

export const mainWorker = new Worker(
	'mailProcessQueue',
	async (job: Job<MailIngestionJobData>, token?: string) => {
		let step = job.data.step;
		const { userId, accountId, remoteMessageId, remoteThreadId } = job.data;

		// If something weird came in, just ignore it.
		if (!job.id || !token) return;

		while (step !== MailIngestionStep.Finished) {
			switch (step) {
				case MailIngestionStep.IngestMessage: {
					let messageImport;
					try {
						messageImport = await baseLogger.adopt(
							async () =>
								consumeMessageImport(
									accountId,
									remoteMessageId,
									(job as JobPro).opts.group?.priority,
								),
							{
								job: {
									remoteMessageId,
									remoteThreadId,
									userId,
									accountId,
								},
							},
						);
					} catch (error) {
						// Handle Google rate limiting
						if (error instanceof GoogleRateLimitError) {
							let ttl;

							if ('getGroupRateLimitTtl' in mailProcessQueue) {
								ttl = await mailProcessQueue.getGroupRateLimitTtl(accountId);
							} else {
								ttl = await mailProcessQueue.getRateLimitTtl();
							}

							// Rate limit the group (or the queue if free BullMQ) if it's not already rate limited
							if (ttl <= 0) {
								logger.info(
									{
										userId,
										accountId,
										error,
									},
									'Google rate limit hit, rate limiting the user',
								);

								if ('rateLimitGroup' in mainWorker) {
									await mainWorker.rateLimitGroup(job as JobPro, 60000);
								} else {
									await mailProcessQueue.rateLimit(60000);
								}
							}

							throw Worker.RateLimitError();
						}

						throw error;
					}

					// If consumeMessageImport returns null, the message was not found or ignored
					if (!messageImport) {
						await job.updateData({
							...job.data,
							step: MailIngestionStep.Finished,
						});
						step = MailIngestionStep.Finished;
						break;
					}

					// It's fine to do the following operations in the same step because it's unlikely for them to fail, which would
					// cause the ingestion to be wastefully fully restarted.

					const tasks: Parameters<(typeof aiQueue)['addBulk']>[0] = [];
					const hasAttachments = messageImport?.parsedMail.attachments?.length > 0;

					// Queue contact score updates
					const shouldWaitForScoreUpdates = await queueContactScoreUpdates(
						messageImport,
						job,
						userId,
						accountId,
					);

					// Always process attachments if they exist
					if (hasAttachments) {
						tasks.push({
							name: 'process-attachment',
							data: {
								userId,
								accountId,
								messageId: messageImport.messageId,
								remoteMessageId: messageImport.remoteMessageId,
								attachments: messageImport.parsedMail.attachments,
							},
							opts: {
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
								group: {
									id: accountId,
								},
							},
						});
					}

					// Only generate mail report if we should tag the message
					if (messageImport.shouldTagMessage) {
						tasks.push({
							name: 'generate-mail-report',
							data: {
								userId,
								accountId,
								messageId: messageImport.messageId,
								parsedMail: messageImport.parsedMail,
							},
							opts: {
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
								group: {
									id: accountId,
								},
							},
						});
					}

					// Queue and wait for tasks if there are any
					if (tasks.length > 0 || shouldWaitForScoreUpdates) {
						if (tasks.length > 0) await aiQueue.addBulk(tasks);

						await job.updateData({
							...job.data,
							step: MailIngestionStep.WaitingForAttachmentsAndReport,
							insertedMessageId: messageImport.messageId,
							parsedMail: messageImport.parsedMail,
							shouldTagMessage: messageImport.shouldTagMessage,
						});
						step = MailIngestionStep.WaitingForAttachmentsAndReport;
						break;
					}

					// No tasks needed - mark as finished
					await job.updateData({
						...job.data,
						step: MailIngestionStep.Finished,
					});
					step = MailIngestionStep.Finished;
					break;
				}
				case MailIngestionStep.WaitingForAttachmentsAndReport: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (shouldWait) {
						throw new WaitingChildrenError();
					}

					invariant(job.data.parsedMail, "Parsed mail should've been set in the previous step");
					if (!job.data.shouldTagMessage) {
						await job.updateData({
							...job.data,
							step: MailIngestionStep.Finished,
						});
						step = MailIngestionStep.Finished;
						break;
					}

					// Extract mail report from children results
					const children = await job.getChildrenValues<{
						report: string;
					}>();

					let mailReport: string | undefined;
					for (const [_, result] of Object.entries(children)) {
						if (result && typeof result === 'object' && 'report' in result) {
							mailReport = result.report as string;
							break;
						}
					}

					const senderEmail = job.data.parsedMail?.from?.value[0]?.address;
					if (senderEmail) {
						await enqueueUpdateInferredContactProfile({
							accountId,
							userId,
							contactEmail: senderEmail,
						});
					}

					let nextStep = MailIngestionStep.FilterForSpace;
					if (remoteMessageId === remoteThreadId) {
						logger.debug(
							{ remoteMessageId, remoteThreadId, insertedMessageId: job.data.insertedMessageId },
							'MailIngestionStep.TagMessage triggered - message is first in thread',
						);
						nextStep = MailIngestionStep.TagMessage;
					}
					await job.updateData({
						...job.data,
						step: nextStep,
						mailReport,
					});
					step = nextStep;
					break;
				}
				case MailIngestionStep.TagMessage: {
					invariant(remoteMessageId === remoteThreadId, 'Only the first message supports tagging');
					invariant(job.data.parsedMail, "Parsed mail should've been set in a previous step");
					invariant(job.data.mailReport, "Mail report should've been generated in a previous step");
					invariant(
						job.data.insertedMessageId,
						"Inserted message id should've been set in a previous step",
					);

					await enqueueTagMessage(
						{
							userId,
							accountId,
							messageId: job.data.insertedMessageId,
							parsedMail: job.data.parsedMail,
							mailReport: job.data.mailReport,
						},
						{
							parent: {
								id: job.id,
								queue: job.queueQualifiedName,
							},
							group: {
								id: accountId,
							},
						},
					);

					await job.updateData({
						...job.data,
						step: MailIngestionStep.WaitingForTagging,
					});
					step = MailIngestionStep.WaitingForTagging;
					break;
				}
				case MailIngestionStep.WaitingForTagging: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (!shouldWait) {
						await job.updateData({
							...job.data,
							step: MailIngestionStep.FilterForSpace,
						});
						step = MailIngestionStep.FilterForSpace;
					} else {
						throw new WaitingChildrenError();
					}
					break;
				}
				case MailIngestionStep.FilterForSpace: {
					invariant(job.data.parsedMail, "Parsed mail should've been set in a previous step");
					invariant(job.data.mailReport, "Mail report should've been generated in a previous step");
					invariant(
						job.data.insertedMessageId,
						"Inserted message id should've been set in a previous step",
					);

					const insertedMessageId = job.data.insertedMessageId;

					// Get user spaces and queue filter jobs
					const userSpaces = await db.query.space.findMany({
						where: (fields, { eq }) => eq(fields.accountId, accountId),
						columns: {
							id: true,
						},
					});

					if (!userSpaces || userSpaces.length === 0) {
						// No spaces to filter - mark as finished
						await job.updateData({
							...job.data,
							step: MailIngestionStep.Finished,
						});
						step = MailIngestionStep.Finished;
						break;
					}

					const fullMessage = await db.query.message.findFirst({
						where: (fields, { eq }) => eq(fields.id, insertedMessageId),
						with: {
							thread: {
								columns: {
									remoteId: true,
								},
							},
							messageAttachments: true,
							messageRecipients: true,
							messageLabels: {
								with: {
									label: true,
								},
							},
						},
					});

					invariant(fullMessage, "Full message should've been fetched from the database");

					// Extract only the needed properties for filtering instead of passing the full message
					const messageData = {
						id: fullMessage.id,
						accountId: fullMessage.accountId,
						userId: fullMessage.userId,
						threadId: fullMessage.threadId,
						subject: fullMessage.subject,
						senderEmail: fullMessage.senderEmail,
						contentText: fullMessage.contentText,
						contentHtml: fullMessage.contentHtml,
						sentAt: fullMessage.sentAt,
						thread: {
							remoteId: fullMessage.thread.remoteId,
						},
						messageRecipients: fullMessage.messageRecipients.map((recipient) => ({
							type: recipient.type,
							email: recipient.email,
						})),
						messageAttachments: fullMessage.messageAttachments.map((attachment) => ({
							id: attachment.id,
						})),
						messageLabels: fullMessage.messageLabels.map((messageLabel) => ({
							label: {
								id: messageLabel.label.id,
							},
						})),
					};

					// Queue filter jobs for all user spaces
					for (const space of userSpaces) {
						await enqueueFilterForSpace(
							{
								step: FilterForSpaceStep.GetSpace,
								messageData,
								spaceId: space.id,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
								group: {
									id: accountId,
								},
							},
						);
					}

					await job.updateData({
						...job.data,
						step: MailIngestionStep.WaitingForFiltering,
					});
					step = MailIngestionStep.WaitingForFiltering;
					break;
				}
				case MailIngestionStep.WaitingForFiltering: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (!shouldWait) {
						// Filtering is complete, mark as finished
						await job.updateData({
							...job.data,
							step: MailIngestionStep.Finished,
						});
						step = MailIngestionStep.Finished;
					} else {
						throw new WaitingChildrenError();
					}
					break;
				}
				default:
					throw new Error('invalid step');
			}
		}

		return undefined as unknown;
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: MAIL_INGESTION_CONCURRENCY,
		group: {
			limit: {
				// Per user (group), we can process 3000 messages per minute (15 000 tokens / 5 tokens per message)
				// By setting the limit to 2900, we allocate some room for listing messages to queue, other queues, getting drafts, user playing with the UI, etc.
				max: 2900,
				duration: 60000,
			},
		},
		limiter: {
			// As a Google project, Marlo has a limit of 1 200 000 token per minute. For the vast vast majority of messages, the only call we do is
			// `message.get`, which cost 5 tokens. So we can process a maximum of 240 000 messages per minute. In practice, however, we will
			// never get close to these numbers, as various I/O operations will slow us down. But still, good to have a limit.
			max: 240000,
			duration: 60000,
		},
	},
);

// Setup error handlers for main worker
setupWorkerErrorHandlers(mainWorker, {
	getJobContext: (job) => {
		const { userId, accountId, remoteMessageId, remoteThreadId, insertedMessageId } =
			job.data as MailIngestionJobData;

		return {
			userId,
			accountId,
			remoteMessageId,
			remoteThreadId,
			messageId: insertedMessageId,
		};
	},
});
