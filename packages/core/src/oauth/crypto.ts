import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuth2Tokens } from 'arctic';

const ALGORITHM = 'aes-256-gcm';
const KEY = process.env.OAUTH_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY || '';

if (!KEY) {
	throw new Error('OAUTH_ENCRYPTION_KEY or ENCRYPTION_KEY environment variable is required');
}

const key = Buffer.from(KEY, 'base64');

interface EncryptedData {
	encrypted: string;
	iv: Buffer;
	tag: Buffer;
}

export function encrypt(text: string): EncryptedData {
	const iv = randomBytes(16);
	const cipher = createCipheriv(ALGORITHM, key, iv);

	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');

	return {
		encrypted,
		iv,
		tag: cipher.getAuthTag(),
	};
}

export function decrypt(
	encrypted: string,
	iv: Buffer | Uint8Array,
	authTag: Buffer | Uint8Array,
): string {
	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	let decrypted = decipher.update(encrypted, 'hex', 'utf8');
	decrypted += decipher.final('utf8');

	return decrypted;
}

/**
 * Validates the state parameter returned from the OAuth provider against the state we stored in the
 * cookie
 */
export function validateState(returnedState: string, storedState: string | undefined): boolean {
	if (!storedState || !returnedState) {
		return false;
	}

	// Use timing-safe comparison to prevent timing attacks
	return timingSafeEqual(Buffer.from(returnedState), Buffer.from(storedState));
}

export type DecryptedTokens = {
	accessToken: string;
	refreshToken: string | undefined;
	expiresAt: Date | null;
	tokenType: string | null;
};

/** Decrypts the access and refresh tokens from the database */
export function decryptTokensFromApp(app: {
	accessTokenEnc: string;
	accessTokenIv: Uint8Array;
	accessTokenAuthTag: Uint8Array;
	refreshTokenEnc?: string | null;
	refreshTokenIv?: Uint8Array | null;
	refreshTokenAuthTag?: Uint8Array | null;
	expiresAt?: Date | null;
	tokenType?: string | null;
}): DecryptedTokens | undefined {
	if (!app.accessTokenEnc || !app.accessTokenIv || !app.accessTokenAuthTag) {
		return undefined;
	}

	const accessToken = decrypt(
		app.accessTokenEnc,
		Buffer.from(app.accessTokenIv),
		Buffer.from(app.accessTokenAuthTag),
	);

	let refreshToken;

	if (app.refreshTokenEnc && app.refreshTokenIv && app.refreshTokenAuthTag) {
		refreshToken = decrypt(
			app.refreshTokenEnc,
			Buffer.from(app.refreshTokenIv),
			Buffer.from(app.refreshTokenAuthTag),
		);
	}

	return {
		accessToken,
		refreshToken,
		expiresAt: app.expiresAt || null,
		tokenType: app.tokenType || null,
	};
}

/** Encrypts the access and refresh tokens for storage in the database */
export function encryptTokens(tokens: OAuth2Tokens): {
	accessTokenEnc: string;
	accessTokenIv: Buffer;
	accessTokenAuthTag: Buffer;
	refreshTokenEnc?: string;
	refreshTokenIv?: Buffer;
	refreshTokenAuthTag?: Buffer;
} {
	const accessToken = encrypt(tokens.accessToken());
	const refreshToken = tokens.hasRefreshToken() ? encrypt(tokens.refreshToken()) : undefined;

	return {
		accessTokenEnc: accessToken.encrypted,
		accessTokenIv: accessToken.iv,
		accessTokenAuthTag: accessToken.tag,
		refreshTokenEnc: refreshToken?.encrypted,
		refreshTokenIv: refreshToken?.iv,
		refreshTokenAuthTag: refreshToken?.tag,
	};
}

export function getExpiresAt(tokens?: OAuth2Tokens): Date | undefined {
	return 'expires_in' in (tokens?.data ?? {}) ? tokens?.accessTokenExpiresAt() : undefined;
}

export function serializeScopes(tokens: OAuth2Tokens): string {
	return tokens?.hasScopes() ? tokens.scopes().join(' ') : '';
}
