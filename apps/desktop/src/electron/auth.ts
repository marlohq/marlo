import fs from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';

export interface AuthTokens {
	session?: string;
	syncjwt?: string;
	refresh?: string;
}

export interface EncryptedTokens {
	session?: string;
	syncjwt?: string;
	refresh?: string;
}

function getTokensPath(): string {
	return path.join(app.getPath('userData'), 'auth-tokens.json');
}

export function storeAuthTokens(tokens: AuthTokens): { success: boolean; error?: string } {
	try {
		const tokensPath = getTokensPath();
		const encryptedTokens: EncryptedTokens = {};

		if (tokens.session) {
			encryptedTokens.session = safeStorage.encryptString(tokens.session).toString('base64');
		}
		if (tokens.syncjwt) {
			encryptedTokens.syncjwt = safeStorage.encryptString(tokens.syncjwt).toString('base64');
		}
		if (tokens.refresh) {
			encryptedTokens.refresh = safeStorage.encryptString(tokens.refresh).toString('base64');
		}

		fs.writeFileSync(tokensPath, JSON.stringify(encryptedTokens));
		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

export function getAuthTokens(): { success: boolean; tokens: AuthTokens; error?: string } {
	try {
		const tokensPath = getTokensPath();

		try {
			const encryptedTokens: EncryptedTokens = JSON.parse(fs.readFileSync(tokensPath, 'utf8'));
			const tokens: AuthTokens = {};

			if (encryptedTokens.session) {
				tokens.session = safeStorage.decryptString(Buffer.from(encryptedTokens.session, 'base64'));
			}
			if (encryptedTokens.syncjwt) {
				tokens.syncjwt = safeStorage.decryptString(Buffer.from(encryptedTokens.syncjwt, 'base64'));
			}
			if (encryptedTokens.refresh) {
				tokens.refresh = safeStorage.decryptString(Buffer.from(encryptedTokens.refresh, 'base64'));
			}

			return { success: true, tokens };
		} catch (fileError) {
			// File doesn't exist or is corrupted
			return { success: false, tokens: {} };
		}
	} catch (error) {
		return {
			success: false,
			tokens: {},
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

export function clearAuthTokens(): { success: boolean; error?: string } {
	try {
		const tokensPath = getTokensPath();

		// Delete the auth tokens file
		if (fs.existsSync(tokensPath)) {
			fs.unlinkSync(tokensPath);
		}

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

export function createCookieString(tokens: AuthTokens): string {
	const cookieStrings: string[] = [];

	if (tokens.session) {
		cookieStrings.push(`session=${tokens.session}`);
	}
	if (tokens.syncjwt) {
		cookieStrings.push(`syncjwt=${tokens.syncjwt}`);
	}
	if (tokens.refresh) {
		cookieStrings.push(`refresh=${tokens.refresh}`);
	}

	return cookieStrings.join('; ');
}

export function attachAuthTokensToHeaders(headers: Headers): void {
	try {
		const { success, tokens } = getAuthTokens();
		if (success && Object.keys(tokens).length > 0) {
			const cookieString = createCookieString(tokens);
			if (cookieString) {
				headers.set('Cookie', cookieString);
			}
		}
	} catch (error) {
		// If token retrieval fails, proceed without cookies and let the request possibly fail
	}
}

export function attachAuthTokensToRequestHeaders(requestHeaders: Record<string, string>): void {
	try {
		const { success, tokens } = getAuthTokens();
		if (success && Object.keys(tokens).length > 0) {
			const cookieString = createCookieString(tokens);
			if (cookieString) {
				requestHeaders.Cookie = cookieString;
			}
		}
	} catch (error) {
		// If token retrieval fails, proceed without cookies and let the request possibly fail
	}
}
