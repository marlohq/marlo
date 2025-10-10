import { describe, expect, it } from 'vitest';
import { connection } from '../src/connection.ts';

describe('Connection', () => {
	it('reconnectings when disconnected from the server', async () => {
		await connection.waitForOpen();

		// Create a proper close event with all required properties
		const closeEvent = Object.assign(new Event('close'), {
			code: 1000,
			reason: 'test',
			wasClean: true,
		});

		connection.onclose(closeEvent);
		expect(connection.status).toBe('disconnected');
		await connection.waitForOpen();
		expect(connection.status).toBe('syncing');
	});
});
