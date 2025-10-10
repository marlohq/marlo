import { applyScoreEvents } from '@workspace/core/contact-score.js';
import type { ContactWorkerType } from '@workspace/core/contacts.js';
import { env } from '@workspace/core/env.js';
import { Worker } from '@workspace/core/queue-exports.ts';
import { connection } from '@workspace/core/redis-connection.js';
import { consumeContact } from '@workspace/google/mail-ingestion/ingest.js';
import { invariant } from 'es-toolkit';
import { setupWorkerErrorHandlers } from '../error.js';

const CONTACT_INGESTION_CONCURRENCY = 50;
const CONTACT_INGESTION_GROUP_CONCURRENCY = 25;

export const contactIngestionWorker = new Worker(
	'contact-ingestion',
	async (job: ContactWorkerType) => {
		const { userId, accountId } = job.data;

		switch (job.name) {
			case 'update-contact-score': {
				const { email, events } = job.data;
				if (events.length === 0) {
					// No events to process, skip
					return;
				}

				invariant(email, 'Email is required for update-contact-score job');
				invariant(events !== undefined, 'Events are required for update-contact-score job');

				await applyScoreEvents(accountId, email, events);
				break;
			}
			case 'ingest-from-email': {
				const { email, name } = job.data;
				invariant(email, 'Email is required for ingest-from-email job');

				const contactData = {
					email,
					name,
				} satisfies Parameters<typeof consumeContact>[0]['contactData'];

				const result = await consumeContact({
					contactData,
					userId,
					accountId,
				});

				break;
			}
		}
	},
	{
		connection,
		prefix: env.get('BULLMQ_QUEUE_PREFIX'),
		concurrency: CONTACT_INGESTION_CONCURRENCY,
		group: {
			concurrency: CONTACT_INGESTION_GROUP_CONCURRENCY,
		},
	},
);

// Setup error handlers for contact ingestion worker
setupWorkerErrorHandlers(contactIngestionWorker, {
	getJobContext: (job) => {
		const { accountId, userId } = job.data;
		return { accountId, userId };
	},
	getErrorMessage: (job) => {
		switch (job.name) {
			case 'ingest-from-email':
				return 'Failed to ingest contact from email';
			default:
				return 'Failed to process contact ingestion job';
		}
	},
});
