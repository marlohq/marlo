import type { ConnectionOptions } from '@workspace/core/queue-exports.js';
import { env } from './env.ts';

export const connection = {
	url: env.require('REDIS_URL'),
} satisfies ConnectionOptions;
