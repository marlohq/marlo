import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Account } from '@workspace/core/drizzle.js';
import type { OAuth2Tokens } from 'arctic';

/**
 * Validates the state parameter returned from the OAuth provider against the state we stored in the
 * cookie
 */
export function validateState(returnedState: string, storedState: string | undefined): boolean {
	if (!storedState || !returnedState) {
		return false;
	}

	// Use timing-safe comparison to prevent timing attacks
	return timingSafeEqual(returnedState, storedState);
}

/**
 * Timing-safe string comparison This prevents timing attacks by taking the same amount of time
 * regardless of how many characters match
 */
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

const algorithm = 'aes-256-gcm';

if (!process.env.OAUTH_ENCRYPTION_KEY) {
	throw new Error('OAUTH_ENCRYPTION_KEY is required');
}
const encryptionKey = Buffer.from(process.env.OAUTH_ENCRYPTION_KEY, 'base64');

export function encrypt(text: string): {
	encrypted: string;
	iv: Buffer;
	tag: Buffer;
} {
	const iv = randomBytes(12);
	const cipher = createCipheriv(algorithm, encryptionKey, iv);

	const encryptedChunks: Buffer[] = [];
	let chunk;

	const textBuffer = Buffer.from(text, 'utf8'); // Convert text to Buffer

	let start = 0;
	// Arbitrary chunk size
	const chunkSize = 256;

	while (start < textBuffer.length) {
		const end = Math.min(start + chunkSize, textBuffer.length);
		const bufferSlice = Uint8Array.prototype.slice.call(textBuffer, start, end);
		chunk = cipher.update(bufferSlice);
		encryptedChunks.push(chunk);
		start = end;
	}

	chunk = cipher.final();
	encryptedChunks.push(chunk);

	const encryptedBuffer = Buffer.concat(encryptedChunks); // Concatenate all chunks
	const encryptedBase64 = encryptedBuffer.toString('base64'); // Convert to base64 *after*

	return {
		encrypted: encryptedBase64,
		iv,
		tag: cipher.getAuthTag(),
	};
}

export function decrypt(encryptedBase64: string, iv: Buffer, tag: Buffer): string {
	const decipher = createDecipheriv(algorithm, encryptionKey, iv);
	decipher.setAuthTag(tag);

	let decrypted = '';
	let chunk;

	const encryptedBuffer = Buffer.from(encryptedBase64, 'base64'); // Decode from base64 first

	let start = 0;
	// Arbitrary chunk size
	const chunkSize = 256;

	while (start < encryptedBuffer.length) {
		const end = Math.min(start + chunkSize, encryptedBuffer.length);
		const bufferSlice = Uint8Array.prototype.slice.call(encryptedBuffer, start, end);
		chunk = decipher.update(bufferSlice);
		decrypted += chunk.toString('utf8');
		start = end;
	}

	chunk = decipher.final(); // Call final AFTER processing all chunks
	decrypted += chunk.toString('utf8');

	return decrypted;
}

export type DecryptedTokens = {
	accessToken: string;
	refreshToken: string | undefined;
	expiresAt: Date | null;
	tokenType: string | null;
};

/** Decrypts the access and refresh tokens from the database */
export function decryptTokensFromAccount(account: Account): DecryptedTokens | undefined {
	if (!account.accessTokenEnc || !account.accessTokenIv || !account.accessTokenAuthTag) {
		return undefined;
	}

	const accessToken = decrypt(
		account.accessTokenEnc,
		Buffer.from(account.accessTokenIv),
		Buffer.from(account.accessTokenAuthTag),
	);

	let refreshToken;

	if (account.refreshTokenEnc && account.refreshTokenIv && account.refreshTokenAuthTag) {
		refreshToken = decrypt(
			account.refreshTokenEnc,
			Buffer.from(account.refreshTokenIv),
			Buffer.from(account.refreshTokenAuthTag),
		);
	}

	return {
		accessToken,
		refreshToken,
		expiresAt: account.expiresAt,
		tokenType: account.tokenType,
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
