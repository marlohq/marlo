import {
	evaluateNaturalQueriesOnEmail,
	evaluatePropertiesOnEmail,
	inferContactProfile,
} from '@workspace/ai';
import { generateMailReportForMessage, tagMessage } from '@workspace/categories/tagging.js';
import {
	contact as contactTable,
	db,
	eq,
	message as messageTable,
} from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { Worker } from '@workspace/core/queue-exports.js';
import { type AiWorkerType, aiQueue } from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import { processMailAttachments } from '@workspace/google/mail-ingestion/attachments.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const AI_PROCESSING_CONCURRENCY = 30; // Keep lower to avoid hitting the global AI rate limit

const logger = baseLogger.child({ namespace: 'mail-ingester:queues:ai' });

async function handleAiRateLimit(
	error: unknown,
	userId: string,
	accountId?: string,
): Promise<never> {
	// If we hit the rate limit, rate limit the queue for a minute and retry the job later, ignoring the retry count.
	// TODO: The model can return the rate limit TTL, we should use that instead of hardcoding 60 seconds.
	const ttl = await aiQueue.getRateLimitTtl();
	if (ttl <= 0) {
		logger.info(
			{
				error,
				userId,
				accountId,
			},
			'AI rate limit hit, rate limiting the queue',
		);
		await aiQueue.rateLimit(60000);
	}
	throw Worker.RateLimitError();
}

export const aiWorker = new Worker(
	'aiQueue',
	async (job: AiWorkerType) => {
		const { userId, accountId } = job.data;

		switch (job.name) {
			case 'process-attachment': {
				const { attachments, remoteMessageId, messageId } = job.data;
				invariant(attachments, 'Attachments are required for process-attachment job');

				let operationResult;

				operationResult = await baseLogger.adopt(
					async () =>
						processMailAttachments(userId, accountId, messageId, remoteMessageId, attachments),
					{
						job: {
							messageId,
							userId,
						},
					},
				);

				// If we hit the rate limit, rate limit the queue for a minute and retry the job later, ignoring the retry count.
				if (operationResult?.status === 'rate-limited') {
					await handleAiRateLimit(operationResult.error, userId, accountId);
				}

				break;
			}
			case 'generate-mail-report': {
				const { parsedMail, messageId } = job.data;

				const operationResult = await baseLogger.adopt(
					async () => generateMailReportForMessage(accountId, messageId, parsedMail),
					{
						job: {
							messageId,
							userId,
						},
					},
				);

				if ('status' in operationResult && operationResult.status === 'rate-limited') {
					await handleAiRateLimit(operationResult.error, userId, accountId);
				}

				// Return the mail report for any parent task to use if needed without getting it from the database again.
				if ('report' in operationResult) {
					return operationResult;
				}

				break;
			}
			case 'tag-message': {
				const { mailReport, parsedMail, messageId } = job.data;

				invariant(mailReport, 'Mail report is required for tag-message job');
				invariant(parsedMail, 'Parsed mail is required for tag-message job');

				await baseLogger.adopt(async () => tagMessage(messageId, mailReport, parsedMail), {
					job: {
						messageId,
						userId,
					},
				});

				break;
			}
			case 'evaluate-natural-queries': {
				const { mailReport, queries, messageId } = job.data;
				invariant(mailReport, 'Mail report is required for evaluate-natural-queries job');
				invariant(queries, 'Queries are required for evaluate-natural-queries job');

				const result = await baseLogger.adopt(
					async () => evaluateNaturalQueriesOnEmail(mailReport, queries),
					{
						job: {
							messageId,
							userId,
						},
					},
				);

				// Return the evaluation results - these will be used by the parent job
				return result;
			}
			case 'evaluate-properties': {
				const { mailReport, properties, messageId } = job.data;
				invariant(mailReport, 'Mail report is required for evaluate-properties job');
				invariant(properties, 'Properties are required for evaluate-properties job');

				const result = await baseLogger.adopt(
					async () => evaluatePropertiesOnEmail(mailReport, properties),
					{
						job: {
							messageId,
							userId,
						},
					},
				);

				// Return the evaluation results - these will be used by the parent job
				return result;
			}
			case 'update-inferred-contact-profile': {
				const { contactEmail } = job.data;
				invariant(
					contactEmail,
					'Contact Email is required for update-inferred-contact-profile job',
				);

				const contact = await db.query.contact.findFirst({
					where: eq(contactTable.email, contactEmail),
				});

				invariant(contact, `Contact with email ${contactEmail} not found`);

				if (
					contact.profileUpdatedAt &&
					contact.profileUpdatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
				) {
					logger.debug(
						{ contactEmail, userId, accountId },
						'Contact profile was updated in the last 7 days, skipping profile inference',
					);
					return;
				}

				const recentMails = await db.query.message.findMany({
					where: eq(messageTable.senderEmail, contact.email),
					columns: {
						extractedContent: true,
					},
					orderBy: (message, { desc }) => [desc(message.sentAt)],
					limit: 3,
				});

				if (!recentMails || recentMails.length === 0) {
					logger.info(
						{ contactEmail, userId, accountId },
						'No recent mails found for contact, skipping profile inference',
					);
					return;
				}

				const inferredProfile = await baseLogger.adopt(
					async () =>
						inferContactProfile({
							contactEmail: contact.email,
							contactName: contact.name,
							recentMailReports: recentMails
								.map((m) => m.extractedContent)
								.filter(Boolean) as string[],
							existingProfile: contact.profile,
						}),
					{
						job: {
							contactEmail,
							userId,
						},
					},
				);

				if (!inferredProfile) {
					logger.warn(
						{ contactEmail, userId, accountId },
						'No inferred profile returned from inference function',
					);
					return;
				}

				// Update the contact profile in the database
				await db
					.update(contactTable)
					.set({
						profile: inferredProfile,
						profileUpdatedAt: new Date(),
					})
					.where(eq(contactTable.email, contactEmail))
					.returning();
			}
		}
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: AI_PROCESSING_CONCURRENCY,
		limiter: {
			// Gemini Flash 2.0 has a limit of 2000 requests per minute for our current tier
			max: 2000,
			duration: 60000,
		},
	},
);

// Setup error handlers for AI worker with custom messages based on job name
setupWorkerErrorHandlers(aiWorker, {
	getJobContext: (job) => {
		const { userId, accountId } = job.data;
		const messageId = 'messageId' in job.data ? job.data.messageId : undefined;
		const remoteMessageId = 'remoteMessageId' in job.data ? job.data.remoteMessageId : undefined;
		return { userId, accountId, messageId, remoteMessageId };
	},
	getErrorMessage: (job) => {
		switch (job.name) {
			case 'process-attachment':
				return 'Failed to process attachment';
			case 'tag-message':
				return 'Failed to tag message';
			case 'generate-mail-report':
				return 'Failed to generate mail report';
			case 'evaluate-natural-queries':
				return 'Failed to evaluate natural queries';
			default:
				return 'Failed to process AI job';
		}
	},
});
