import type { OAuth2Tokens } from 'arctic';
import type { JsonObject } from './json.js';

export interface ArcticClientBase {
	createAuthorizationURL(state: string, scopes?: Array<string>): URL;
	validateAuthorizationCode(code: string): Promise<OAuth2Tokens>;
	refreshAccessToken?(refreshToken: string): Promise<OAuth2Tokens>;
	revokeToken?(token: string): Promise<void>;
}

export interface ArcticClientWithCodeVerifier
	extends Omit<ArcticClientBase, 'createAuthorizationURL' | 'validateAuthorizationCode'> {
	createAuthorizationURL(state: string, codeVerifier: string, scopes?: Array<string>): URL;
	validateAuthorizationCode(code: string, codeVerifier: string): Promise<OAuth2Tokens>;
}

export type ArcticClient = ArcticClientBase | ArcticClientWithCodeVerifier;

type ArcticClientConstructor = new (
	clientId: string,
	clientSecret: string,
	redirectURI: string,
) => ArcticClient;

export interface OAuthConfig {
	/** Either define this static value or clientIdName */
	clientId?: string;
	/** The server env var that contains the client id */
	clientIdName?: string;
	/** Either define this static value or clientSecretName */
	clientSecret?: string;
	/** The server env var that contains the client secret */
	clientSecretName?: string;
	/** The Arctic to use for OAuth */
	client: ArcticClientConstructor;
	scopes?: string[];
	/** The URL to get user info from when authenticated */
	userInfoUrl?: string;
	/** Optional function to handle the user info response. Defaults to storing the raw JSON */
	handleUserInfo?: (userInfo: unknown) => Promise<JsonObject>;
}
