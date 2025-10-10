import { calculateScoreDecay } from '@workspace/core/contact-score.js';
import { and, contact as contactTable, db, eq, gt } from '@workspace/core/drizzle.js';
import { env } from '@workspace/core/env.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { createQueue, type Job, Worker } from '@workspace/core/queue-exports.js';
import { connection } from '@workspace/core/redis-connection.js';
import { setupWorkerErrorHandlers } from '../../error.js';

const logger = baseLogger.child({ namespace: 'mail-ingester:contact-score-decay' });

const CONCURRENCY = 30;

export const scoreDecayQueue = createQueue('contact-score-decay', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		removeOnComplete: 100,
		removeOnFail: 200,
	},
});

interface ScoreDecayJobData {
	accountId: string;
}

export const scoreDecayWorker = new Worker(
	'contact-score-decay',
	async (job: Job<ScoreDecayJobData>) => {
		const { accountId } = job.data;

		logger.info({ accountId }, 'Starting score decay for account');

		const contacts = await db
			.select({
				id: contactTable.id,
				score: contactTable.score,
				scoreUpdatedAt: contactTable.scoreUpdatedAt,
			})
			.from(contactTable)
			.where(and(eq(contactTable.accountId, accountId), gt(contactTable.score, 0)));

		const updatedContacts: { id: string; oldScore: number; newScore: number }[] = [];

		for (const contact of contacts) {
			const { newScore, shouldUpdate } = calculateScoreDecay(contact.score, contact.scoreUpdatedAt);

			// Only update if the score actually changed to avoid updating the timestamp unnecessarily
			if (shouldUpdate) {
				await db
					.update(contactTable)
					.set({
						score: newScore,
						scoreUpdatedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(contactTable.id, contact.id));

				updatedContacts.push({
					id: contact.id,
					oldScore: contact.score,
					newScore,
				});
			}
		}

		logger.info(
			{
				accountId,
				contactsDecayed: updatedContacts.length,
				decayDetails:
					updatedContacts.length > 0
						? {
								sampleDecay: updatedContacts.slice(0, 3).map((c) => ({
									old: c.oldScore,
									new: c.newScore,
								})),
							}
						: undefined,
			},
			'Completed score decay for account',
		);
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: CONCURRENCY,
	},
);

setupWorkerErrorHandlers(scoreDecayWorker, {
	getJobContext: (job) => ({ accountId: job.data.accountId }),
	getErrorMessage: () => 'Failed to apply score decay',
});
