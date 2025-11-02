import LRU from '@alloc/quick-lru';
import type { APIRoute } from 'astro';
import { invariant } from 'es-toolkit';
import z from 'zod';
import { GH_FETCH_RELEASE_TOKEN } from '../../env.ts';

const REPO_OWNER = 'marlohq';
const REPO_NAME = 'marlo';

const releaseCache = new LRU<string, string>({ maxAge: 1000 * 60 * 5, maxSize: 1000 });

function getLookupHeaders() {
	invariant(GH_FETCH_RELEASE_TOKEN, 'GH_FETCH_RELEASE_TOKEN is required');
	return {
		Accept: 'application/vnd.github+json',
		Authorization: `Bearer ${GH_FETCH_RELEASE_TOKEN}`,
		'X-GitHub-Api-Version': '2022-11-28',
	};
}

function getAssetHeaders(requestHeaders: Headers) {
	invariant(GH_FETCH_RELEASE_TOKEN, 'GH_FETCH_RELEASE_TOKEN is required');
	const assetHeaders: Record<string, string> = {
		Accept: 'application/octet-stream',
		Authorization: `Bearer ${GH_FETCH_RELEASE_TOKEN}`,
		'X-GitHub-Api-Version': '2022-11-28',
	};
	const requestRangeHeader = requestHeaders.get('range');
	if (requestRangeHeader) {
		assetHeaders.Range = requestRangeHeader;
	}
	return assetHeaders;
}

const lookupResponseSchema = z.object({
	assets: z.array(z.object({ id: z.number(), name: z.string() })),
});

async function getAssetId(format: string) {
	const lookupUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
	const response = await fetch(lookupUrl, { headers: getLookupHeaders() });
	if (!response.ok) return new Response('Failed to load latest release', { status: 502 });
	const rawData = await response.json();
	const data = lookupResponseSchema.parse(rawData);
	return data.assets.find((a) => a.name.endsWith(`.${format}`))?.id;
}

export const GET: APIRoute = async ({ request, params }) => {
	// NOTE(fks) Currently hardcoded to only get the mac download. In the future, read `id` to
	// decide which asset to download.
	const id = params.id;
	if (id !== 'mac') {
		return new Response('Only mac downloads are supported for now', { status: 400 });
	}

	const format = 'dmg';
	const assetId = releaseCache.get(format) || (await getAssetId(format));
	if (!assetId) {
		return new Response('No asset found in latest release', { status: 404 });
	}

	releaseCache.set(format, assetId as string);
	const assetUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${assetId}`;
	const response = await fetch(assetUrl, {
		headers: getAssetHeaders(request.headers),
		redirect: 'follow',
	}).catch((e) => {
		return { ok: false, body: null };
	});

	if (!response.ok || !response.body) {
		releaseCache.delete(format);
		return new Response('Failed to download asset', { status: 502 });
	}

	const headers = new Headers(response.headers);
	headers.set('Content-Disposition', `attachment; filename="Astro Installer.dmg"`);
	headers.set('Content-Type', 'application/x-apple-diskimage');
	return new Response(response.body, { status: response.status, headers });
};
