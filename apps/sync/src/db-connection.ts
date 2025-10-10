import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import pgPromise, { type IConnected, type ILostContext } from 'pg-promise';
import type { IClient } from 'pg-promise/typescript/pg-subset';
import { DIRECT_DATABASE_URL } from './env.ts';
import { onNotification } from './listener.js';

const channels = ['thread', 'account', 'label', 'contact', 'draft', 'signature'] as const;
export type Channel = (typeof channels)[number];

const logger = baseLogger.child({ namespace: 'local-server:db-connection' });

const pgp = pgPromise({});

const db = pgp(DIRECT_DATABASE_URL);

const MAX_CONNECTION_DELAY = 60000; // Maximum delay for reconnecting

// Setup listeners for notifications
async function setupListeners(channel: Channel, db: IConnected<unknown, IClient>): Promise<void> {
	db.client.on('notification', (event) => onNotification(event, channel));

	try {
		// biome-ignore lint/suspicious/noTemplateCurlyInString: Format is correct, expected by Dexie.
		await db.none('LISTEN ${channel:name}', { channel });
	} catch (error) {
		// TODO: This is very unlikely to happen, because LISTEN can't really fail, but we should handle it anyway
		captureException({ error, channel }, 'Failed to listen to channel');
		logger.error(
			{
				error,
			},
			'Failed to listen to channel',
		);
	}
}

// Remove listeners when the connection is lost
function removeListeners(client: IClient): void {
	client.removeListener('notification', onNotification);
}

// Handle connection loss and attempt to reconnect
async function onConnectionLost(error: Error, e: ILostContext): Promise<void> {
	logger.error({ error }, 'Lost connection to database');
	removeListeners(e.client);

	await connect({ reconnectDelay: 5000 }); // Start reconnect with 5-second delay
	logger.info('Successfully Reconnected');
}

// Reconnect with exponential backoff and capping delay
async function connect(opts: { reconnectDelay: number }): Promise<IConnected<unknown, IClient>> {
	let delay = opts.reconnectDelay;
	let connection;

	while (!connection) {
		try {
			// Try to establish a connection
			connection = await db.connect({ direct: true, onLost: onConnectionLost });
			connection.client.setMaxListeners(channels.length);
			for (const channel of channels) {
				await setupListeners(channel, connection);
			}
			logger.info('Connected to database, waiting for notifications...');
			return connection;
		} catch (error) {
			logger.error({ error }, 'Failed to connect to database');

			delay = Math.min(delay * 2, MAX_CONNECTION_DELAY);
			logger.info(`Retrying in ${delay}ms...`);

			await new Promise((resolve) => setTimeout(resolve, delay)); // Wait before retrying
		}
	}

	return connection;
}

await connect({ reconnectDelay: 500 });
