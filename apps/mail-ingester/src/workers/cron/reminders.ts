import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createQueue, type Job, Worker } from '@workspace/core/queue-exports.js';
import { connection } from '@workspace/core/redis-connection.js';
import { syncWithRemote } from '@workspace/core/remote-sync.js';
import { setupWorkerErrorHandlers } from '../../error.js';

const CONCURRENCY = 30;

const logger = baseLogger.child({ namespace: 'mail-ingester:cron:handle-reminders' });

export const handleRemindersQueue = createQueue('handle-reminders', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

interface HandleRemindersJobData {
	accountId: string;
	threadRemoteIds: string[];
}

export const handleRemindersWorker = new Worker(
	'handle-reminders',
	async (job: Job<HandleRemindersJobData>) => {
		logger.debug({ jobId: job.id }, 'Processing handle reminders job');

		await syncWithRemote({
			action: { id: 'resolve:remove' },
			accountId: job.data.accountId,
			remoteThreadIds: job.data.threadRemoteIds,
		});
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: CONCURRENCY,
	},
);

// Setup error handlers for handle reminders worker
setupWorkerErrorHandlers(handleRemindersWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to handle reminders',
});
