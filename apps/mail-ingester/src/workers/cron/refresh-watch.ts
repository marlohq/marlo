import { db } from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import {
	createQueue,
	type Job,
	UnrecoverableError,
	Worker,
} from '@workspace/core/queue-exports.js';
import { connection } from '@workspace/core/redis-connection.js';
import { updateAccountWatchExpiration, watchAccount } from '@workspace/google/account.js';
import { getGmailClientForAccount } from '@workspace/google/request-client.js';
import { setupWorkerErrorHandlers } from '../../error.js';

const CONCURRENCY = 30;

const logger = baseLogger.child({ namespace: 'mail-ingester:cron:refresh-watch' });

export const refreshAccountWatchQueue = createQueue('refresh-account-watch', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		removeOnComplete: 200,
		removeOnFail: 250,
	},
});

interface RefreshAccountWatchJobData {
	accountId: string;
}

export const refreshAccountWatchWorker = new Worker(
	'refresh-account-watch',
	async (job: Job<RefreshAccountWatchJobData>) => {
		const account = await db.query.account.findFirst({
			where: (account, { eq }) => eq(account.id, job.data.accountId),
		});

		if (!account) {
			logger.warn({ accountId: job.data.accountId }, 'Account not found');
			throw new UnrecoverableError('Account not found');
		}

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
				'Account is not active, skipping refresh',
			);
			return;
		}

		logger.info({ accountId: account.id }, 'Refreshing account watch');
		const { client: gmail, error } = await getGmailClientForAccount(account);

		if (error) {
			logger.warn(
				{ accountId: account.id },
				'Failed to get Gmail client for account, unauthenticated.',
			);

			// No need to retry, though, we probably won't succeed next time either if we failed here.
			return;
		}

		const accountWatch = await watchAccount(gmail, account.id);

		await updateAccountWatchExpiration(account, accountWatch.expiration);
		logger.info({ accountId: account.id }, 'Account watch refreshed');
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: CONCURRENCY,
	},
);

// Setup error handlers for refresh account watch worker
setupWorkerErrorHandlers(refreshAccountWatchWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to refresh account watch',
});
