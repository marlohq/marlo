import { isElectron } from '@workspace/core/electron.ts';
import { decodeJwt } from 'jose';
import Cookies from 'js-cookie';

interface SyncJWTPayload {
	sub: string;
	email: string;
}

const SYNC_COOKIE = 'syncjwt';

// Cache for the decoded JWT
let cachedDecodedJWT: SyncJWTPayload | null = null;
let cachedEncodedJWT: string | null = null;
let tokensInitialized = false;

// Initialize tokens on app load
export async function initializeAuth(): Promise<void> {
	if (tokensInitialized) return;

	try {
		if (isElectron) {
			// Use Electron IPC for token storage
			const result = await window.electronAPI.getAuthTokens();
			if (result?.success && result.tokens?.syncjwt) {
				cachedEncodedJWT = result.tokens.syncjwt;
				cachedDecodedJWT = decodeJwt<SyncJWTPayload>(result.tokens.syncjwt);
			}
		} else {
			// Use cookies for web environment
			const jwt = Cookies.get(SYNC_COOKIE);
			if (jwt) {
				cachedEncodedJWT = jwt;
				cachedDecodedJWT = decodeJwt<SyncJWTPayload>(jwt);
			}
		}
		tokensInitialized = true;
	} catch (error) {
		tokensInitialized = true; // Mark as initialized even if failed
	}
}

// Sync getters (throw if not initialized)
export function getAccountId(): string {
	if (!tokensInitialized) {
		throw new Error('Auth not initialized. Call initializeAuth() first.');
	}
	return cachedDecodedJWT?.sub ?? 'anon';
}

export function getAccountEmail(): string {
	if (!tokensInitialized) {
		throw new Error('Auth not initialized. Call initializeAuth() first.');
	}
	return cachedDecodedJWT?.email ?? 'anon@example.com';
}

export function getJWT(): string {
	if (!tokensInitialized) {
		throw new Error('Auth not initialized. Call initializeAuth() first.');
	}
	if (!cachedEncodedJWT) {
		window.location.href = '/login';
		throw new Error('Unreachable - redirecting to login');
	}
	return cachedEncodedJWT;
}

export function clearAuthCache(): void {
	cachedDecodedJWT = null;
	cachedEncodedJWT = null;
	tokensInitialized = false;
}

await initializeAuth(); // Ensure auth is initialized on import

// Legacy exports - now sync but require initialization
export const accountId = getAccountId();
export const accountEmail = getAccountEmail();
