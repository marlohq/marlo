import type { ScoreEventType } from '@workspace/core/contact-score.js';
import { env } from '@workspace/core/env.js';
import { connection } from '@workspace/core/redis-connection.js';
import { createQueue, type Job } from './queue-exports.ts';

export function shouldUpdateContactProfile(lastUpdate: Date | null): boolean {
	if (!lastUpdate) return true; // Never updated before, so we should update

	const now = new Date();
	const diffInMs = now.getTime() - lastUpdate.getTime();
	const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

	// Update if last update was more or equal to 7 days ago
	return diffInDays >= 7;
}

export interface ContactProfile {
	title?: string;
	company?: string;
	location?: string;
	phone_number?: string;
	website?: string;
	socialMedia?: { platform: string; url: string }[];
}

export interface IngestFromEmailJobData {
	userId: string;
	accountId: string;
	email: string;
	name?: string;
}

export interface UpdateContactScoreJobData {
	userId: string;
	accountId: string;
	email: string;
	events: ScoreEventType[];
}

export type ContactWorkerType =
	| Job<IngestFromEmailJobData, unknown, 'ingest-from-email'>
	| Job<UpdateContactScoreJobData, unknown, 'update-contact-score'>;

export const contactIngestionQueue = createQueue('contact-ingestion', {
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
	defaultJobOptions: {
		// This is triggered a lot, because it gets done for every user once in a while, we don't really care about keeping these jobs around.
		removeOnComplete: 100,
		removeOnFail: 250,
	},
});

export async function queueContactIngestionFromEmail(
	userId: string,
	accountId: string,
	email: string,
	name?: string,
) {
	return contactIngestionQueue.add(
		'ingest-from-email',
		{
			userId,
			accountId,
			email,
			name,
		} satisfies IngestFromEmailJobData,
		{
			group: {
				id: accountId,
			}, // Group by account to avoid
		},
	);
}
