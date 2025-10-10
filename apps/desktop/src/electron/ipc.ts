import { prependBackendUrl } from '@workspace/core/url.js';
import { type BrowserWindow, ipcMain, net } from 'electron';
import { clearAuthTokens, getAuthTokens, storeAuthTokens } from './auth.js';

export function setupGlobalIPC(mainWindow: BrowserWindow): void {
	ipcMain.handle('trigger-login-event', async (_, url) => {
		mainWindow.webContents.send('login', url);
	});

	ipcMain.handle('set-auth-tokens', async (event, tokens) => {
		return storeAuthTokens(tokens);
	});

	// Add a handler to retrieve tokens (cookies are already set on app load)
	ipcMain.handle('get-auth-tokens', async () => {
		return getAuthTokens();
	});

	// Add a handler to clear auth tokens on logout
	ipcMain.handle('clear-auth-tokens', async () => {
		return clearAuthTokens();
	});

	ipcMain.handle('auth-sync', async (event, sessionToken) => {
		try {
			const response = await net.fetch(prependBackendUrl('/auth/sync'), {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					sessionToken: sessionToken,
				}),
			});

			const result = await response.json();

			if (!result.success) {
				return {
					success: false,
					error: result.error || 'Failed to sync auth tokens',
				};
			}

			return {
				success: true,
				data: {
					syncjwt: result.syncjwt,
				},
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error during auth sync',
			};
		}
	});
}
