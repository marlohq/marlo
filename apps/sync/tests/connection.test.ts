import { describe, expect, it } from 'vitest';
import { Connection, POKE_THROTTLE } from '../src/connection.ts';
import { MockWebSocket } from './mocks.ts';

function waitForNextPoke() {
	return new Promise((resolve) => {
		setTimeout(() => {
			resolve(true);
		}, POKE_THROTTLE);
	});
}

describe('sync: Connection', () => {
	it('does not poke if already queued', async () => {
		let pokes = 0;
		class MyWebSocket extends MockWebSocket {
			send() {
				pokes++;
			}
		}

		const id = crypto.randomUUID();
		const accountId = crypto.randomUUID();
		const userId = crypto.randomUUID();
		const connection = new Connection(
			id,
			new MyWebSocket('ws://localhost:8080'),
			accountId,
			userId,
		);
		connection.queuePoke();
		expect(connection.pokeId).not.toBeNull();
		await waitForNextPoke();
		expect(connection.pokeId).toBeNull();
		expect(pokes).toBe(1);
	});

	it('waits for syncing to complete before poking', async () => {
		let pokes = 0;
		class MyWebSocket extends MockWebSocket {
			send() {
				pokes++;
			}
		}

		const id = crypto.randomUUID();
		const accountId = crypto.randomUUID();
		const userId = crypto.randomUUID();
		const connection = new Connection(
			id,
			new MyWebSocket('ws://localhost:8080'),
			accountId,
			userId,
		);
		connection.setSyncStatus('syncing');
		connection.queuePoke();
		expect(connection.pokeId).not.toBeNull();
		await waitForNextPoke();
		expect(connection.pokeId).not.toBeNull();
		connection.setSyncStatus('idle');
		await waitForNextPoke();
		expect(connection.pokeId).toBeNull();
		expect(pokes).toBe(1);
	});
});
