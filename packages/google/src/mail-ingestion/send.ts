import { env } from '@workspace/core/env.js';
import { createQueue } from '@workspace/core/queue-exports.ts';
import { connection } from '@workspace/core/redis-connection.js';

export interface SendEmailWorkerJobData {
	encoded: string;
	accountId: string;
	messageId: string | undefined;
	draftId: string | undefined;
	remoteThreadId?: string;
}

export const sendEmailQueue = createQueue<SendEmailWorkerJobData>('sendEmailQueue', {
	defaultJobOptions: {
		attempts: 3,
		backoff: {
			type: 'exponential',
			delay: 1000,
		},
		removeOnComplete: 1000,
		removeOnFail: 1500,
	},
	connection,
	prefix: env.get('BULLMQ_QUEUE_PREFIX'),
});

export async function queueSendEmail(options: {
	sendAt: Date;
	accountId: string;
	messageId: string | undefined;
	draftId: string | undefined;
	encoded: string;
	remoteThreadId?: string;
}) {
	const { sendAt, ...rest } = options;
	const delay = Number(sendAt) - Date.now();

	await sendEmailQueue.add('process-send-email', rest, { delay });
}
