import { Google, type OAuth2Tokens } from 'arctic';

class GoogleClient extends Google {
	override createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL {
		const url = super.createAuthorizationURL(state, codeVerifier, scopes);

		// These params are necessary in order to receive a
		// refresh_token. Google does not provide these by default.
		url.searchParams.set('access_type', 'offline');
		url.searchParams.set('include_granted_scopes', 'true');
		return url;
	}
	override async refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens> {
		const tokens = await super.refreshAccessToken(refreshToken);
		Object.defineProperty(tokens.data, 'refresh_token', {
			value: refreshToken,
			enumerable: true,
		});
		return tokens;
	}
}

export const oauthConfig = {
	clientIdName: 'GOOGLE_CLIENT_ID',
	clientSecretName: 'GOOGLE_CLIENT_SECRET',
	userInfoUrl: 'https://www.googleapis.com/oauth2/v1/userinfo?alt=json',
	client: GoogleClient,
	// On initial login, we only need the openid, profile, and email scopes
	// On upgrade, we need the gmail.modify scope
	scopes: [
		'openid',
		'profile',
		'email',
		'https://www.googleapis.com/auth/gmail.readonly',
		'https://www.googleapis.com/auth/pubsub',
		'https://www.googleapis.com/auth/gmail.modify',
		'https://www.googleapis.com/auth/gmail.compose',
		'https://www.googleapis.com/auth/gmail.send',
		'https://www.googleapis.com/auth/contacts.readonly',
		'https://www.googleapis.com/auth/contacts.other.readonly',
	],
};
