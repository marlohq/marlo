import { execSync } from 'node:child_process';
import { beforeAll } from 'vitest';
import './mocks.ts';
import { resetDatabase } from '../../scripts/reset-db.ts';

beforeAll(async () => {
	await resetDatabase();
	execSync('redis-cli -h 127.0.0.1 -p 6379 -n 0 FLUSHDB', { cwd: '../../' });
});
