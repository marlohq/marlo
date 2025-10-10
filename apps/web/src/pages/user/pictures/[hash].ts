import { getUserPicture } from '@workspace/core/storage/user-profile.js';
import type { APIRoute } from 'astro';

export const GET: APIRoute = async (context) => {
	const { hash } = context.params;
	if (!hash) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	const currentAccount = await context.locals.currentAccount();
	if (!currentAccount) {
		return new Response(null, {
			status: 401,
			statusText: 'Unauthorized',
		});
	}

	try {
		const stream = await getUserPicture(currentAccount.userId, hash);

		if (!stream) {
			return new Response(null, {
				status: 404,
				statusText: 'Not found',
			});
		}

		return new Response(stream as BodyInit, {
			headers: {
				// Cache for 1 day, but allow stale while revalidating for 1 week
				'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
			},
			status: 200,
		});
	} catch {
		// Probably not found
		// TODO handle other possible reasons it threw
		return new Response(null, {
			status: 404,
			statusText: 'Not found',
		});
	}
};
