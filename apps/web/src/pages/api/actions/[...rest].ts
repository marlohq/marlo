import { RPCHandler } from '@orpc/server/fetch';
import type { APIRoute } from 'astro';
import { router } from '../../../api/index.ts';

const handler = new RPCHandler(router);

export const ALL: APIRoute = async (context) => {
	const { response } = await handler.handle(context.request, {
		prefix: '/api/actions',
		context: {
			locals: context.locals,
			cookies: context.cookies,
		},
	});

	return response ?? new Response('Not found', { status: 404 });
};
