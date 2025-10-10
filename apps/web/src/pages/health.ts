import { logger as baseLogger } from '@workspace/core/logger.ts';
import type { APIRoute } from 'astro';

const logger = baseLogger.child({
	module: 'health',
});

export const GET: APIRoute = async () => {
	logger.info('Health check');
	return new Response('OK', {
		status: 200,
	});
};
