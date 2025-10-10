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
import { updateAccountInfo, updateGmailAccountSignature } from '@workspace/google/account.js';
import {
	getGmailClientForAccount,
	getOAuthClientForAccount,
} from '@workspace/google/request-client.js';
import { setupWorkerErrorHandlers } from '../../error.js';

const CONCURRENCY = 30;

const logger = baseLogger.child({ namespace: 'mail-ingester:cron:refresh-profiles' });

export const refreshProfilesQueue = createQueue('refresh-user-profiles', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 2500,
		},
		removeOnComplete: 200,
		removeOnFail: 250,
	},
});

interface RefreshUserProfilesJobData {
	accountId: string;
}

export const refreshProfilesWorker = new Worker(
	'refresh-user-profiles',
	async (job: Job<RefreshUserProfilesJobData>) => {
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

		logger.info({ accountId: account.id }, 'Refreshing account user info');
		const { client: auth, error } = await getOAuthClientForAccount(account);

		if (error) {
			logger.warn(
				{ accountId: account.id },
				'Failed to get OAuth client for account, unauthenticated.',
			);
			return;
		}

		const { client: gmail, error: errorGmail } = await getGmailClientForAccount(account);

		if (errorGmail) {
			logger.warn(
				{ accountId: account.id },
				'Failed to get Gmail client for account, unauthenticated.',
			);
			return;
		}

		const { data: user } = await auth.userinfo.get();
		await updateAccountInfo(account, user);
		await updateGmailAccountSignature(account, gmail);

		logger.info({ accountId: account.id }, 'Account user info refreshed');
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: CONCURRENCY,
	},
);

// Setup error handlers for refresh profiles worker
setupWorkerErrorHandlers(refreshProfilesWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to refresh account user info',
});
