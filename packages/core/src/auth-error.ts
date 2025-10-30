import { isElectron } from './electron.ts';

/**
 * Handle account authentication errors (ERROR state, expired JWT, etc.) Clears auth state and
 * redirects to login. Fire-and-forget - doesn't wait for completion.
 *
 * Web: Redirects to /login. Middleware will clear cookies on next request. Electron: Clears auth
 * tokens via IPC, then triggers login flow.
 */
export function handleAccountError(): void {
	if (isElectron) {
		// Clear Electron secure storage asynchronously
		window.electronAPI.clearAuthTokens().then(() => {
			// Trigger login flow with null tokens to reset auth state
			window.electronAPI.triggerLoginEvent({
				session: null,
				refresh: null,
			});
		});
	} else {
		// Web: Redirect to login. Middleware will handle cookie cleanup.
		window.location.href = '/login';
	}
}
