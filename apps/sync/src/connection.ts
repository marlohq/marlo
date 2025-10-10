import type { WebSocket } from 'ws';
import { sendMessage } from './socket.ts';

// Minimum time between pokes.
export const POKE_THROTTLE = 500;

type SyncStatus = 'syncing' | 'idle';

export class Connection {
	syncStatus: SyncStatus = 'idle';
	pokeId: NodeJS.Timeout | null = null;

	constructor(
		public id: string,
		public socket: WebSocket,
		public accountId: string,
		public userId: string,
	) {}

	queuePoke() {
		if (this.pokeId) {
			return;
		}
		this.pokeId = setTimeout(() => this.sendPokeOrRequeue(), POKE_THROTTLE);
	}

	setSyncStatus(status: SyncStatus) {
		this.syncStatus = status;
	}

	stop() {
		if (this.pokeId) {
			clearTimeout(this.pokeId);
			this.pokeId = null;
		}
	}

	sendMutationComplete(mutationId: string, error?: string) {
		sendMessage(this.socket, { type: 'mutation-complete', mutationId, error });
	}

	private sendPokeOrRequeue() {
		this.pokeId = null;
		// Don't poke if we're already syncing.
		if (this.syncStatus === 'syncing') {
			this.queuePoke();
		} else {
			this.poke();
		}
	}

	private poke() {
		sendMessage(this.socket, { type: 'poke' });
	}
}
