import type { ServerMessage } from '@workspace/sync-data/server-messages.ts';
import { WebSocket } from 'ws';

export function isSocketOpen(socket: WebSocket): boolean {
	return socket.readyState === WebSocket.OPEN;
}

export function sendMessage(socket: WebSocket, message: ServerMessage) {
	if (isSocketOpen(socket)) {
		socket.send(JSON.stringify(message));
	}
}
