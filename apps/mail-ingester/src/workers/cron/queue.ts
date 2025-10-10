import { and, db, sql } from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import {
	createQueue,
	type Job,
	UnrecoverableError,
	WaitingChildrenError,
	Worker,
} from '@workspace/core/queue-exports.js';
import { connection } from '@workspace/core/redis-connection.js';
import { spaceActionsCronQueue } from '../../cron/space-actions.js';
import { setupWorkerErrorHandlers } from '../../error.js';
import { refreshProfilesQueue } from './refresh-profiles.js';
import { refreshAccountWatchQueue } from './refresh-watch.js';
import { handleRemindersQueue } from './reminders.js';
import { scoreDecayQueue } from './score-decay.js';

const logger = baseLogger.child({ namespace: 'mail-ingester:cron' });

enum CronStep {
	Starting = 0,
	WaitingForSubtasks = 1,
	Finished = 2,
}

interface CronJobData {
	step: CronStep;
}

export const cronQueue = createQueue('cron', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		// There's a lot of these, and they're not super interesting to look at versus their subtasks,
		removeOnComplete: 250,
		removeOnFail: 500,
	},
});

type CronJobName =
	| 'queue-refresh-user-profiles'
	| 'queue-refresh-account-watch'
	| 'queue-handle-reminders'
	| 'queue-space-actions-cron'
	| 'queue-score-decay';

export const cronQueueWorker = new Worker(
	'cron',
	async (job: Job<CronJobData, unknown>, token: string | null | undefined) => {
		// If something weird came in, just ignore it.
		if (!job.id || !token) return;

		let step = job.data.step;
		const jobId = job.id;

		const jobName = job.name as CronJobName;

		while (step !== CronStep.Finished) {
			switch (step) {
				case CronStep.Starting: {
					switch (jobName) {
						case 'queue-refresh-user-profiles': {
							const accounts = await db.query.account.findMany({
								where: (account, { eq }) => eq(account.status, 'ACTIVE'),
								columns: {
									id: true,
								},
							});

							logger.info({ accountCount: accounts.length }, `Refreshing user info on accounts`);

							await refreshProfilesQueue.addBulk(
								accounts.map((account) => ({
									name: 'refresh-user-profiles',
									data: { accountId: account.id },
									opts: {
										parent: {
											id: jobId,
											queue: job.queueQualifiedName,
										},
									},
								})),
							);

							break;
						}
						case 'queue-refresh-account-watch': {
							// Refresh every account whose watchExpiration is in less than 7 days
							// The expiration date is technically 7 days after the watch was set up, but Google recommends to refresh it every day
							const accounts = await db.query.account.findMany({
								where: (account, { eq, or, lt, isNull }) =>
									and(
										eq(account.status, 'ACTIVE'),
										or(
											lt(account.watchExpiration, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
											isNull(account.watchExpiration),
										),
									),
								columns: {
									id: true,
								},
							});

							logger.info(
								{ accountCount: accounts.length },
								`Refreshing account watch on accounts`,
							);

							if (accounts.length === 0) {
								// No accounts to refresh
								await job.updateData({
									step: CronStep.Finished,
								});
								return;
							}

							await refreshAccountWatchQueue.addBulk(
								accounts.map((account) => ({
									name: 'refresh-account-watch',
									data: { accountId: account.id },
									opts: {
										parent: {
											id: jobId,
											queue: job.queueQualifiedName,
										},
									},
								})),
							);

							break;
						}
						case 'queue-handle-reminders': {
							const accountsWithThreads = await db
								.execute<{
									accountId: string;
									threadRemoteIds: string[];
								}>(
									sql`
								WITH eligible_threads AS (
									SELECT "id", "accountId", "remoteId"
									FROM "Thread"
									WHERE "remindAt" <= NOW()
								), updated_threads AS (
									UPDATE "Thread"
									SET "reminderTriggeredAt" = NOW(),
									    "remindAt" = NULL,
									    "resolvedAt" = NULL,
										"updatedAt" = NOW()
									WHERE "id" IN (SELECT "id" FROM eligible_threads)
									RETURNING "id", "accountId", "remoteId"
								), updated_messages AS (
									UPDATE "Message"
									SET "readAt" = NULL
									WHERE "threadId" IN (SELECT "id" FROM updated_threads)
									RETURNING "threadId", "remoteId"
								)
								SELECT
									u."accountId",
									COALESCE(array_agg(u."remoteId"), ARRAY[]::text[]) AS "threadRemoteIds"
								FROM
									updated_threads u
								GROUP BY
									u."accountId";
							`,
								)
								.then((result) => result.rows);
							if (accountsWithThreads.length === 0) {
								await job.updateData({
									step: CronStep.Finished,
								});
								return;
							}

							logger.info(
								{ accountCount: accountsWithThreads.length },
								`Handling reminders for accounts`,
							);

							await handleRemindersQueue.addBulk(
								accountsWithThreads.flatMap((ids) => ({
									name: 'handle-reminders',
									data: {
										accountId: ids.accountId,
										threadRemoteIds: ids.threadRemoteIds,
									},
									opts: {
										parent: {
											id: jobId,
											queue: job.queueQualifiedName,
										},
									},
								})),
							);
							break;
						}
						case 'queue-space-actions-cron': {
							logger.info('Queueing space actions cron processing');

							await spaceActionsCronQueue.add('process-space-actions-cron', undefined);

							break;
						}
						case 'queue-score-decay': {
							const accounts = await db.query.account.findMany({
								where: (account, { eq }) => eq(account.status, 'ACTIVE'),
								columns: {
									id: true,
								},
							});

							logger.info({ accountCount: accounts.length }, `Applying score decay to contacts`);

							await scoreDecayQueue.addBulk(
								accounts.map((account) => ({
									name: 'contact-score-decay',
									data: { accountId: account.id },
									opts: {
										parent: {
											id: jobId,
											queue: job.queueQualifiedName,
										},
									},
								})),
							);

							break;
						}
						default: {
							throw new UnrecoverableError(`Unknown cron job name: ${job.name}`);
						}
					}

					await job.updateData({
						step: CronStep.WaitingForSubtasks,
					});
					step = CronStep.WaitingForSubtasks;

					break;
				}
				case CronStep.WaitingForSubtasks: {
					const shouldWait = await job.moveToWaitingChildren(token);
					if (!shouldWait) {
						await job.updateData({
							step: CronStep.Finished,
						});
						step = CronStep.Finished;
					} else {
						throw new WaitingChildrenError();
					}
					break;
				}
				default: {
					throw new UnrecoverableError(`Unknown cron job step: ${step}`);
				}
			}
		}
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	},
);

// Setup error handlers for cron queue worker
setupWorkerErrorHandlers(cronQueueWorker, {
	getErrorMessage: () => 'Failed to queue cron jobs',
});

const defaultJobSettings = {
	attempts: 3,
	backoff: {
		type: 'exponential',
		delay: 3000,
	},
	// There's a lot of these, so we don't want to keep them around for too long.
	removeOnComplete: 100,
	removeOnFail: 200,
};

await cronQueue.upsertJobScheduler(
	'refresh-account-watch-scheduler',
	{ pattern: '0 0 1 * * *' },
	{
		name: 'queue-refresh-account-watch',
		data: {
			step: CronStep.Starting,
		},
		opts: defaultJobSettings,
	},
);

await cronQueue.upsertJobScheduler(
	'refresh-profiles-scheduler',
	{ pattern: '0 0 1 * * *' },
	{
		name: 'queue-refresh-user-profiles',
		data: {
			step: CronStep.Starting,
		},
		opts: defaultJobSettings,
	},
);

await cronQueue.upsertJobScheduler(
	'refresh-reminders-scheduler',
	{ every: 15000 },
	{
		name: 'queue-handle-reminders',
		data: {
			step: CronStep.Starting,
		},
		// Since this happens a lot, there's a lot of jobs and keeping them around would be a waste of memory.
		// There's also no need to retry this, it'll just run again in 15 seconds.
		opts: { removeOnComplete: false, removeOnFail: 100 },
	},
);

await cronQueue.upsertJobScheduler(
	'space-actions-cron-scheduler',
	{ every: 60000 }, // Every minute
	{
		name: 'queue-space-actions-cron',
		data: {
			step: CronStep.Starting,
		},
		// Check every minute, no need to keep completed jobs around
		opts: { removeOnComplete: false, removeOnFail: 100 },
	},
);

await cronQueue.upsertJobScheduler(
	'score-decay-scheduler',
	{ pattern: '0 0 2 * * *' }, // Every day at 2 AM
	{
		name: 'queue-score-decay',
		data: {
			step: CronStep.Starting,
		},
		opts: defaultJobSettings,
	},
);
