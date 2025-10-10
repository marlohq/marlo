import type { APIRoute } from 'astro';

// Server endpoint that matches the chat action
export const GET: APIRoute = async ({ request }) => {
	const url = new URL(request.url);
	const domain = url.searchParams.get('domain');
	if (!domain) {
		return new Response('Missing domain parameter', { status: 400 });
	}

	const iconUrl = `https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=256`;
	const response = await fetch(iconUrl);
	if (!response.ok) {
		return new Response('Failed to fetch icon', { status: response.status });
	}
	if (!response.body) {
		return new Response('Empty response body from icon service', { status: 500 });
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: new Headers({
			'Content-Type': response.headers.get('Content-Type') ?? 'image/png',
			'Cache-Control': 'public, max-age=86400',
		}),
	});
};
