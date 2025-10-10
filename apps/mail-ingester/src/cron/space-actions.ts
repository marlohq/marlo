import { db } from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createQueue, type Job, Worker } from '@workspace/core/queue-exports.js';
import { enqueueSpaceActions } from '@workspace/core/queues.js';
import { connection } from '@workspace/core/redis-connection.js';
import { setupWorkerErrorHandlers } from '../error.ts';

const logger = baseLogger.child({ namespace: 'mail-ingester:cron:space-actions' });

export const spaceActionsCronQueue = createQueue<void>('space-actions-cron', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		removeOnComplete: 100,
		removeOnFail: 500,
	},
});

/**
 * Process space actions that should run on cron schedule
 *
 * This function is called every minute and checks all cron actions. For now, we'll run ALL cron
 * actions every time. In the future, we can add more sophisticated scheduling based on the
 * cronSchedule field.
 */
async function processSpaceActionsCron(): Promise<void> {
	try {
		logger.info('Checking space actions for cron execution');

		// Get all enabled cron actions
		const cronActions = await db.query.spaceAction.findMany({
			where: (action, { eq, and, isNotNull }) =>
				and(eq(action.triggerType, 'cron'), isNotNull(action.cronSchedule)),
			columns: {
				id: true,
				cronSchedule: true,
				prompt: true,
				spaceId: true,
				accountId: true,
			},
		});

		if (cronActions.length === 0) {
			logger.debug('No cron actions found');
			return;
		}

		logger.info({ actionCount: cronActions.length }, 'Found cron actions to execute');

		// For MVP, we'll execute all cron actions when called
		// In the future, we can parse cronSchedule to determine if it should run
		//actionQueue.add('execute-action', data, opts);
		await enqueueSpaceActions(
			cronActions.map((action) => ({
				actionId: action.id,
				triggerType: 'cron',
				// No threadId for cron actions
			})),
		);

		logger.info(
			{ actionCount: cronActions.length },
			'Successfully queued cron actions for execution',
		);
	} catch (error) {
		captureException({ error }, 'Failed to process space actions cron');
		throw error;
	}
}

export const spaceActionsCronWorker = new Worker(
	'space-actions-cron',
	async (job: Job<unknown>) => {
		logger.info({ jobId: job.id }, 'Processing space actions cron job');
		await processSpaceActionsCron();
	},
	{
		connection,
		concurrency: 1, // Only run one cron check at a time
	},
);

setupWorkerErrorHandlers(spaceActionsCronWorker, {
	getJobContext: (job) => {
		return {
			jobId: job.id,
		};
	},
});
