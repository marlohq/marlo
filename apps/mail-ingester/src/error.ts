import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { Job, Worker } from '@workspace/core/queue-exports.js';
import { UnrecoverableError } from '@workspace/core/queue-exports.js';

type ErrorHandlerOptions<T = unknown> = {
	/**
	 * Optional function to extract context data from the job for logging This will be included in
	 * both error capturing and warning logs
	 */
	getJobContext?: (job: Job<T>) => Record<string, unknown>;

	/**
	 * Optional function to get a custom error message based on the job If not provided, will use a
	 * generic message with the worker name
	 */
	getErrorMessage?: (job: Job<T>) => string;

	/** Optional logger instance. If not provided, will use the base logger */
	logger?: typeof baseLogger;
};

export function setupWorkerErrorHandlers<T = unknown>(
	// biome-ignore lint/suspicious/noExplicitAny: We don't really care about the other properties of the worker here, just the data
	worker: Worker<T, any, any>,
	options: ErrorHandlerOptions<T>,
): void {
	const logger = options.logger || baseLogger;

	// biome-ignore lint/suspicious/noExplicitAny: This might be a Job or JobPro depending on whether BullMQ Pro is used, but we don't care about the difference here
	worker.on('failed', (job: any, err: Error) => {
		if (!job) return;

		const shouldRetry = !(
			(job.opts.attempts && job.attemptsMade >= job.opts.attempts) ||
			err instanceof UnrecoverableError
		);

		const jobContext = options.getJobContext ? options.getJobContext(job) : {};

		const errorMessage = options.getErrorMessage
			? options.getErrorMessage(job)
			: `Failed to process ${worker.qualifiedName} job`;

		if (!shouldRetry) {
			captureException({ ...jobContext, error: err }, errorMessage);
		} else {
			logger.warn({ ...jobContext, error: err }, `${errorMessage}, will retry`);
		}
	});

	worker.on('error', (err: Error) => {
		captureException({ error: err }, `${worker.qualifiedName} worker encountered an error`);
	});
}
