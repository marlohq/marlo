import type {
	ArcticClient,
	ArcticClientWithCodeVerifier,
	OAuthConfig,
} from '@workspace/core/oauth.js';

export function getClient(oauth: OAuthConfig, provider?: string, base?: URL): ArcticClient {
	const redirectUri = provider && base ? new URL(`/auth/${provider}/callback`, base) : '';
	return getClientForRedirect(oauth, redirectUri);
}

export function getClientForRedirect(oauth: OAuthConfig, redirectUri: URL | string): ArcticClient {
	const clientSecret = oauth.clientSecret ?? process.env[oauth.clientSecretName ?? ''] ?? '';
	const clientId = oauth.clientId ?? process.env[oauth.clientIdName ?? ''] ?? '';
	return new oauth.client(clientId, clientSecret, redirectUri.toString());
}

export function isClientWithCodeVerifier(
	client: ArcticClient,
): client is ArcticClientWithCodeVerifier {
	// There are 2 different signatures depending on if the client
	// needs a codeVerifier. We use the function length to determine it's of that type.
	return client.createAuthorizationURL.length === 3;
}

export async function revokeToken({
	oauth,
	token,
}: {
	oauth: OAuthConfig;
	token: string;
}): Promise<void> {
	const clientSecret = oauth.clientSecret ?? process.env[oauth.clientIdName ?? ''] ?? '';
	const clientId = oauth.clientId ?? process.env[oauth.clientIdName ?? ''] ?? '';
	const client = new oauth.client(clientId, clientSecret, '');
	client.revokeToken?.(token);
}
