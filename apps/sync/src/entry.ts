import * as http from 'node:http';
import type {
	BatchMessages,
	ClientMessage,
	MutationMessages,
} from '@workspace/sync-data/client-messages.ts';
import { type WebSocket, type Data as WebSocketData, WebSocketServer } from 'ws';
import type { Connection as ClientConnection } from './connection.ts';
import { connectionHub } from './connections.ts';
import './db-connection.js';

import { account as accountTable, db, eq } from '@workspace/core/drizzle.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { ClientSyncState } from '@workspace/sync-data/schema.js';
import { verifyJWT } from './auth.ts';
import {
	mutateAccount,
	mutateChatConversation,
	mutateDraft,
	mutateLabel,
	mutateMessage,
	mutateMessages,
	mutateSpace,
	mutateSpaceAction,
	mutateSpaceActions,
	mutateThread,
	mutateThreads,
} from './mutate.ts';
import { isSocketOpen, sendMessage } from './socket.ts';
import { sync } from './sync.ts';

// Set the Node.js process timezone to UTC. Useful for development.
process.env.TZ = 'Europe/Amsterdam';

const logger = baseLogger.child({
	namespace: 'sync-engine:entry',
});

const server = http.createServer((req, res) => {
	if (req.url === '/health') {
		res.statusCode = 200;
		res.end('ok');
		return;
	}
});
const wss = new WebSocketServer({ server });

// Handle WebSocket connections
wss.on('connection', async (socket: WebSocket, req: http.IncomingMessage) => {
	// Authenticate using subprotocol
	const protocols = req.headers['sec-websocket-protocol']?.split(', ') || [];
	if (!protocols.includes('marlo-auth')) {
		socket.close(1002, 'marlo-auth protocol required');
		return;
	}

	// Extract JWT from subprotocol (second protocol should be the JWT)
	const jwt = protocols[1];
	if (!jwt) {
		socket.close(1002, 'JWT required in subprotocol');
		return;
	}

	// Verify JWT before creating connection
	try {
		const claims = await verifyJWT(jwt);
		if (!claims) {
			socket.close(1008, 'Invalid JWT');
			return;
		}

		const { sub: accountId, userId } = claims;

		// Create connection with accountId and userId
		const connectionId = connectionHub.createConnection(socket, accountId, userId);

		// Handle messages from clients
		socket.on('message', async (data: WebSocketData) => {
			const message = JSON.parse(data.toString()) as ClientMessage;
			try {
				await handleMessage(socket, connectionId, message);
			} catch (error) {
				captureException({ error, messageType: message.type }, 'Error handling message');
			}
		});

		// Handle disconnection
		socket.on('close', () => {
			connectionHub.removeConnection(connectionId);
		});

		// Handle errors
		socket.on('error', (error) => {
			logger.error({ error, connectionId }, 'WebSocket error');
		});
	} catch (error) {
		socket.close(1008, 'JWT verification failed');
	}
});

async function handleMessage(
	socket: WebSocket,
	connectionId: string,
	message: ClientMessage,
): Promise<void> {
	logger.debug({ type: message.type }, 'received message');
	switch (message.type) {
		case 'mutation': {
			const connection = connectionHub.getConnection(connectionId);
			const { accountId, userId } = connection;
			try {
				await performMutation({ accountId, userId, message });
				connection.sendMutationComplete(message.id);
			} catch (error) {
				captureException({ error, messageType: message.type }, 'Error performing mutation');
				connection.sendMutationComplete(message.id, 'Error performing mutation');
			}
			return;
		}
		case 'batch': {
			const connection = connectionHub.getConnection(connectionId);
			const { accountId, userId } = connection;
			try {
				await performBatchMutation({ accountId, userId, message });
				connection.sendMutationComplete(message.id);
			} catch (error) {
				captureException({ error, messageType: message.type }, 'Error performing batch mutation');
				connection.sendMutationComplete(message.id, 'Error performing batch mutation');
			}
			return;
		}
		case 'pull': {
			const { clientState } = message;
			const connection = connectionHub.getConnection(connectionId);
			logger.debug({ accountId: connection.accountId, userId: connection.userId }, 'received pull');
			triggerSync(connection, clientState);
			return;
		}
	}
}

async function performMutation({
	accountId,
	userId,
	message,
}: {
	accountId: string;
	userId: string;
	message: MutationMessages;
}) {
	const t0 = performance.now();
	const { table, action } = message;
	logger.debug({ accountId, userId, table, action }, 'received mutation');

	// Check account status before mutation - if in ERROR state, throw
	const account = await db.query.account.findFirst({
		where: eq(accountTable.id, accountId),
		columns: { status: true },
	});

	if (!account || account.status !== 'ACTIVE') {
		throw new Error('Account is not active');
	}

	switch (table) {
		case 'Account': {
			await mutateAccount(accountId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated account',
			);
			break;
		}
		case 'Message': {
			await mutateMessage(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated message',
			);
			break;
		}
		case 'Label': {
			await mutateLabel(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated label',
			);
			break;
		}
		case 'Thread': {
			await mutateThread(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated thread',
			);
			break;
		}
		case 'ChatConversation': {
			await mutateChatConversation(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated chat conversation',
			);
			break;
		}
		case 'Draft': {
			await mutateDraft(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated draft',
			);
			break;
		}
		case 'Space': {
			await mutateSpace(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated space',
			);
			break;
		}
		case 'SpaceAction': {
			await mutateSpaceAction(accountId, userId, message);
			logger.debug(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Mutated space action',
			);
			break;
		}
	}
}

async function performBatchMutation({
	accountId,
	userId,
	message,
}: {
	accountId: string;
	userId: string;
	message: BatchMessages;
}) {
	const t0 = performance.now();
	const { table, action } = message;
	logger.debug({ accountId, userId, table, action }, 'received batch mutation');
	switch (table) {
		case 'Thread': {
			await mutateThreads(accountId, userId, message);
			break;
		}
		case 'Message': {
			await mutateMessages(accountId, userId, message);
			break;
		}
		case 'SpaceAction': {
			await mutateSpaceActions(accountId, userId, message);
			break;
		}
		default: {
			logger.error(
				{ accountId, userId, table, action, duration: performance.now() - t0 },
				'Unknown table',
			);
			break;
		}
	}
}

async function triggerSync(connection: ClientConnection, clientState: ClientSyncState) {
	const t0 = performance.now();
	const { accountId, userId } = connection;
	logger.debug({ accountId }, 'Starting sync');

	// Check account status before sync - if in ERROR state, close connection
	const account = await db.query.account.findFirst({
		where: eq(accountTable.id, accountId),
		columns: { status: true },
	});

	if (!account || account.status !== 'ACTIVE') {
		logger.info({ accountId }, 'Account is not active, closing sync connection');
		connection.socket.close(1008, 'Account authentication failed');
		return;
	}

	connection.setSyncStatus('syncing');
	for await (const message of sync({ accountId, userId, clientState })) {
		// If the socket is closed, stop the sync.
		if (!isSocketOpen(connection.socket)) {
			logger.info({ accountId }, 'Socket is not open, stopping sync');
			break;
		}
		sendMessage(connection.socket, message);
	}
	logger.debug({ accountId, userId, duration: performance.now() - t0 }, 'Completed sync');
	sendMessage(connection.socket, { type: 'synced' });
	connection.setSyncStatus('idle');
}

// Start the server
const PORT = process.env.PORT || 5003;
server.listen(PORT, () => {
	logger.info(`WebSocket server is running on port ${PORT}`);
});
