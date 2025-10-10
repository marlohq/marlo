import { account, db, eq } from '@workspace/core/drizzle.ts';
import { env } from '@workspace/core/env.js';
import { logger } from '@workspace/core/logger.js';
import {
	createQueue,
	type Job,
	WaitingChildrenError,
	Worker,
} from '@workspace/core/queue-exports.js';
import { connection } from '@workspace/core/redis-connection.js';
import {
	consumeHistory,
	consumeHistoryLabelChanges,
	consumeHistoryMessageChanges,
	type UpdateHistoryJobData,
	UpdateHistoryJobStep,
} from '@workspace/google/mail-ingestion/history.ts';
import { getTokensAndRefreshIfNeeded } from '@workspace/google/oauth/refresh.js';
import { getGmailClientFromTokens } from '@workspace/google/request-client.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const HISTORY_UPDATE_CONCURRENCY = 50;

export const historyUpdateWorker = new Worker(
	'history-update',
	async (job: Job<UpdateHistoryJobData>, token: string | null | undefined) => {
		// If something weird came in, just ignore it.
		if (!job.id || !token) return;

		let step = job.data.step;
		const { emailAddress } = job.data;

		logger.info({ jobId: job.id, emailAddress, step }, 'Processing history update job');

		while (step !== UpdateHistoryJobStep.Finished) {
			switch (step) {
				case UpdateHistoryJobStep.GatheringHistory: {
					const account = await db.query.account.findFirst({
						where: (fields, { eq }) => eq(fields.email, emailAddress),
					});
					if (!account) {
						logger.warn({ email: emailAddress }, 'No account found for email');
						return;
					}

					if (account.status !== 'ACTIVE') {
						logger.warn(
							{ accountId: account.id, email: emailAddress, errorCode: account.errorCode },
							'Account is not active, skipping history update',
						);
						return;
					}

					const currentHistoryId = account.historyId;
					if (!currentHistoryId) {
						logger.warn({ accountId: account.id, userId: account.userId }, 'No historyId set');
						return;
					}

					const tokens = await getTokensAndRefreshIfNeeded(account);
					if (!tokens) {
						logger.warn({ email: emailAddress }, 'Unable to refresh tokens');
						return;
					}

					const gmail = getGmailClientFromTokens(tokens);

					const history = await consumeHistory(gmail, currentHistoryId, account);

					// If we didn't get a full history object, we have nothing else to process in this, we ran into an error and
					// had to reprocess the entire account.
					if (!history) {
						return;
					}

					if (history.removedMessages.length > 0) {
						await historyUpdateMessageChanges.add(
							'history-update-message',
							{
								removedMessages: history.removedMessages,
								accountId: account.id,
								userId: account.userId,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
							},
						);
					}

					if (history.addedMessages.length > 0) {
						await historyUpdateMessageChanges.add(
							'history-update-message',
							{
								addedMessages: history.addedMessages,
								accountId: account.id,
								userId: account.userId,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
							},
						);
					}

					if (Object.keys(history.messageLabelsChanges).length > 0) {
						await historyUpdateLabelChanges.add(
							'history-update-message-labels',
							{
								labelChanges: history.messageLabelsChanges,
								accountId: account.id,
								userId: account.userId,
							},
							{
								parent: {
									id: job.id,
									queue: job.queueQualifiedName,
								},
							},
						);
					}

					await job.updateData({
						...job.data,
						accountId: account.id,
						historyId: history.historyId,
						step: UpdateHistoryJobStep.WaitingForSubtasks,
					});
					step = UpdateHistoryJobStep.WaitingForSubtasks;

					break;
				}
				case UpdateHistoryJobStep.WaitingForSubtasks: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (!shouldWait) {
						invariant(job.data.accountId, 'Job data should always contain accountId at this point');
						await db
							.update(account)
							.set({ historyId: job.data.historyId })
							.where(eq(account.id, job.data.accountId));

						await job.updateData({
							...job.data,
							step: UpdateHistoryJobStep.Finished,
						});
						step = UpdateHistoryJobStep.Finished;

						return UpdateHistoryJobStep.Finished;
					} else {
						throw new WaitingChildrenError();
					}
				}
			}
		}
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: HISTORY_UPDATE_CONCURRENCY,
		group: {
			// For every user, we only want to process one history update at a time, because we need to do it in order.
			concurrency: 1,
		},
	},
);

// Setup error handlers for history update worker
setupWorkerErrorHandlers(historyUpdateWorker, {
	getJobContext: (job) => {
		const { historyId, emailAddress } = job.data;
		return { historyId, emailAddress };
	},
	getErrorMessage: () => 'Failed to process history update job',
});

interface HistoryUpdateMessage {
	addedMessages?: { messageId: string; threadId: string }[];
	removedMessages?: { messageId: string; threadId: string }[];
	accountId: string;
	userId: string;
}

export const historyUpdateMessageChanges = createQueue<HistoryUpdateMessage>(
	'history-update-message',
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		defaultJobOptions: {
			// We get a lot of this, so we don't need/want to keep it around for long.
			removeOnComplete: 100,
			removeOnFail: 500,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 3000,
			},
		},
	},
);

const historyUpdateMessageWorker = new Worker(
	'history-update-message',
	async (job: Job<HistoryUpdateMessage>) => {
		if (!job.id) return;
		if (!job.data.addedMessages && !job.data.removedMessages) {
			logger.warn({ jobId: job.id }, 'Job contain no messages to process');
			return;
		}

		const { accountId, userId } = job.data;

		await consumeHistoryMessageChanges(
			accountId,
			userId,
			job.data.addedMessages,
			job.data.removedMessages,
		);
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

// Setup error handlers for history update message worker
setupWorkerErrorHandlers(historyUpdateMessageWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to process history message update job',
});

interface HistoryUpdateMessageLabels {
	labelChanges: Record<
		string,
		{ threadId: string; labelsAdded: string[]; labelsRemoved: string[] }
	>;
	accountId: string;
	userId: string;
}

export const historyUpdateLabelChanges = createQueue<HistoryUpdateMessageLabels>(
	'history-update-message-labels',
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		defaultJobOptions: {
			// We get a lot of this, so we don't need/want to keep it around for long.
			removeOnComplete: 100,
			removeOnFail: 500,
			attempts: 3,
			backoff: {
				type: 'exponential',
				delay: 3000,
			},
		},
	},
);

const historyUpdateLabelWorker = new Worker(
	'history-update-message-labels',
	async (job: Job<HistoryUpdateMessageLabels>) => {
		if (!job.id) return;
		if (!job.data.labelChanges) {
			logger.warn({ jobId: job.id }, 'Job contain no messages to process');
			return;
		}

		const { accountId, userId } = job.data;

		await consumeHistoryLabelChanges(accountId, userId, job.data.labelChanges);
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

// Setup error handlers for history update label worker
setupWorkerErrorHandlers(historyUpdateLabelWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to process history label update job',
});
