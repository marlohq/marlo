import { captureException } from '@workspace/core/instrument.js';
import { logger } from '@workspace/core/logger.js';
import { spaceActionsCronWorker } from './cron/space-actions.ts';
import { server } from './server/app.ts';
import { actionWorker } from './workers/actions.ts';
import { aiWorker } from './workers/ai.ts';
import { contactIngestionWorker } from './workers/contacts.ts';
import { cronQueueWorker } from './workers/cron/queue.ts';
import { refreshProfilesWorker } from './workers/cron/refresh-profiles.ts';
import { refreshAccountWatchWorker } from './workers/cron/refresh-watch.ts';
import { handleRemindersWorker } from './workers/cron/reminders.ts';
import { scoreDecayWorker } from './workers/cron/score-decay.ts';
import {
	historyUpdateLabelChanges,
	historyUpdateMessageChanges,
	historyUpdateWorker,
} from './workers/history.ts';
import { mainWorker } from './workers/ingest.ts';
import { filterForSpaceWorker, propertyEvaluationWorker } from './workers/spaces.ts';
import { sendEmailWorker, syncActionToRemoteWorker } from './workers/sync-to-remote.ts';

logger.info('Starting mail-ingester');

// Set the Node.js process timezone to UTC. Useful for development.
process.env.TZ = 'Europe/Amsterdam';

let shuttingDown = false;

for (const signal of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
	process.on(signal, () => cleanup(signal));
}

for (const unhandled of ['uncaughtException', 'unhandledRejection']) {
	process.on(unhandled, (error) => {
		logger.error({ error }, `Unhandled ${unhandled}`);
		cleanup(unhandled);
	});
}

// Note that in dev, due to a bug in `tsx`, this function may not get called correctly in certain cases. See: https://github.com/privatenumber/tsx/issues/586
// This is not a big problem, the jobs will just stall and BullMQ will eventually time them out and retry them. When running the app in production, this will work correctly.
async function cleanup(shutdownReason: string) {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	logger.info(`Received ${shutdownReason}, attempting to shut down gracefully...`);

	// Stop accepting new requests
	server.close();

	// Try to stop the workers gracefully
	const shutdownTimeout = 15000; // 15 seconds

	await Promise.race([
		Promise.all([
			mainWorker.close(),
			aiWorker.close(),
			contactIngestionWorker.close(),
			cronQueueWorker.close(),
			refreshProfilesWorker.close(),
			refreshAccountWatchWorker.close(),
			handleRemindersWorker.close(),
			scoreDecayWorker.close(),
			spaceActionsCronWorker.close(),
			sendEmailWorker.close(),
			historyUpdateWorker.close(),
			historyUpdateMessageChanges.close(),
			historyUpdateLabelChanges.close(),
			syncActionToRemoteWorker.close(),
			filterForSpaceWorker.close(),
			propertyEvaluationWorker.close(),
			actionWorker.close(),
		]),
		new Promise((_, reject) =>
			setTimeout(() => reject(new Error('Shutdown timed out')), shutdownTimeout),
		),
	]).catch((error) => {
		captureException({ error }, 'Shutdown process failed or timed out');
	});

	process.exit(1);
}
