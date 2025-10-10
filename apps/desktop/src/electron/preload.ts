import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
	onLogin: (callback) => {
		ipcRenderer.on('login', (_event, value) => {
			callback(value);
		});
	},
	setAuthTokens: (tokens) => {
		return ipcRenderer.invoke('set-auth-tokens', tokens);
	},
	getAuthTokens: () => {
		return ipcRenderer.invoke('get-auth-tokens');
	},
	clearAuthTokens: () => {
		return ipcRenderer.invoke('clear-auth-tokens');
	},
	authSync: (sessionToken) => {
		return ipcRenderer.invoke('auth-sync', sessionToken);
	},
	triggerLoginEvent: (url) => {
		return ipcRenderer.invoke('trigger-login-event', url);
	},
	isPackaged: false, // Hardcode for now - change to true when building for production
} satisfies typeof window.electronAPI);
