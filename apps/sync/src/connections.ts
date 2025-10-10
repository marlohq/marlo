import { invariant } from 'es-toolkit';
import type { WebSocket } from 'ws';
import { Connection as ClientConnection } from './connection.js';

export const connectionHub = {
	connections: new Map<string, ClientConnection>(),
	createConnection(socket: WebSocket, accountId: string, userId: string) {
		const connectionId = crypto.randomUUID();
		const clientConnection = new ClientConnection(connectionId, socket, accountId, userId);
		this.connections.set(connectionId, clientConnection);
		return connectionId;
	},
	removeConnection(id: string) {
		const connection = this.connections.get(id);
		if (connection) {
			connection.socket.close();
		}
	},
	getConnection(id: string) {
		const connection = this.connections.get(id);
		invariant(connection, 'Connection not found');
		return connection;
	},
	queuePoke(accountId: string) {
		this.connections.forEach((connection) => {
			if (connection.accountId === accountId) {
				connection.queuePoke();
			}
		});
	},
};
