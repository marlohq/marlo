import { logger as baseLogger } from '@workspace/core/logger.js';
import type { APIRoute } from 'astro';
import { PUBLIC_BACKEND_URL } from '../../env.ts';
import { getCurrentAccount } from '../../lib/auth.ts';

const logger = baseLogger.child({
	namespace: 'mail/images',
});

const originMatch = new RegExp(
	`^https?://(localhost|${PUBLIC_BACKEND_URL.replace(/^https?:\/\//, '')})(:d+)?(/.*)?$`,
);

const imageContentTypes = new Set([
	'image/jpeg',
	'image/png',
	'image/gif',
	'image/webp',
	'image/svg+xml',
	'image/bmp',
	'image/tiff',
	'image/x-icon',
	'image/avif',
	'application/octet-stream',
]);

export const GET: APIRoute = async (context) => {
	const currentAccount = await getCurrentAccount(context);
	if (!currentAccount) {
		return new Response(null, {
			status: 401,
			statusText: 'Unauthorized',
		});
	}

	const origin = context.request.headers.get('Origin');
	// Allow requests with no origin (same-origin requests may not have it)
	// Otherwise check if origin is from allowed domains
	if (!origin?.match(originMatch)) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	const accountId = currentAccount.id;
	const url = context.url.searchParams.get('url');
	logger.info({ accountId, url }, 'mail/images: url');
	if (!url) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	let fetchResponse;

	try {
		fetchResponse = await fetch(url, {
			method: 'GET',
			headers: new Headers(context.request.headers),
			redirect: 'follow',
		});
	} catch (error) {
		logger.warn({ accountId, url, error }, 'mail/images: failed to fetch image');
		return new Response(null, {
			status: 502,
			statusText: 'Bad Gateway',
		});
	}

	// Response headers
	const headers = new Headers();
	// 1 day
	headers.set('Cache-Control', 'max-age=86400, s-maxage=86400');

	const contentType = fetchResponse.headers.get('Content-Type');
	logger.info({ accountId, contentType, url: url.toString() }, 'mail/images: content type');
	if (!contentType || !imageContentTypes.has(contentType)) {
		return new Response(null, {
			status: 400,
			statusText: 'Bad request',
		});
	}

	headers.set('Content-Type', contentType);
	const contentLength = fetchResponse.headers.get('Content-Length');
	if (contentLength) {
		headers.set('Content-Length', contentLength);
	}

	// Only allow loading images if the request comes from our domain
	headers.set('Cross-Origin-Resource-Policy', 'same-origin');

	// Prevent the image from being embedded in other sites
	headers.set('Content-Security-Policy', "img-src 'self'");

	return new Response(fetchResponse.body, {
		status: fetchResponse.status,
		statusText: fetchResponse.statusText,
		headers: headers,
	});
};
