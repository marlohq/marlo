import path from 'node:path';
import url from 'node:url';
import { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@workspace/core/cookies.js';
import { app, BrowserWindow, globalShortcut, net, protocol, session, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { attachAuthTokensToHeaders, attachAuthTokensToRequestHeaders } from './auth.js';
import { DEV_BASE_URL } from './consts.js';
import { setupGlobalIPC } from './ipc.js';
import { setupApplicationMenu } from './menu.js';

const autoUpdater = electronUpdater.autoUpdater;

const dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Configure auto-updater
if (!app.isPackaged) {
	// In development, disable auto-updater
	autoUpdater.updateConfigPath = path.join(dirname, 'dev-app-update.yml');
}

// Auto-updater initialization - will be called after app ready

// Auto-updater event handlers (only in packaged app)
if (app.isPackaged) {
	autoUpdater.on('checking-for-update', () => {
		// console.log('Checking for update...');
	});

	autoUpdater.on('update-available', (info) => {
		// console.log('Update available:', info);
	});

	autoUpdater.on('update-not-available', (info) => {
		// console.log('Update not available:', info);
	});

	autoUpdater.on('error', (err) => {
		// console.log('Error in auto-updater:', err);
	});

	autoUpdater.on('download-progress', (progressObj) => {
		let log_message = `Download speed: ${progressObj.bytesPerSecond}`;
		log_message = `${log_message} - Downloaded ${progressObj.percent}%`;
		log_message = `${log_message} (${progressObj.transferred}/${progressObj.total})`;
		// console.log(log_message);
	});

	autoUpdater.on('update-downloaded', (info) => {
		// console.log('Update downloaded:', info);
		// You can choose to auto-restart or show a dialog to the user
		autoUpdater.quitAndInstall();
	});
} else {
	// console.info('Auto-updater disabled in development mode');
}

const createWindow = () => {
	const mainWindow = new BrowserWindow({
		title: 'Marlo',
		width: 1200,
		height: 800,
		titleBarStyle: 'hidden',
		...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
		backgroundColor: '#E5E5E5',
		webPreferences: {
			preload: path.join(dirname, 'preload.mjs'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	mainWindow.loadURL(app.isPackaged ? 'marlo://app/' : DEV_BASE_URL);
	setupApplicationMenu();

	return mainWindow;
};

// Register protocol privileges before app ready
protocol.registerSchemesAsPrivileged([
	{
		scheme: 'marlo',
		privileges: {
			standard: true,
			secure: true,
			allowServiceWorkers: true,
			supportFetchAPI: true,
			corsEnabled: true,
		},
	},
]);

if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient('marlo', process.execPath, [path.resolve(process.argv[1])]);
	}
} else {
	app.setAsDefaultProtocolClient('marlo');
}

app.whenReady().then(async () => {
	// Set the application name for menus and about dialog
	app.setName('Marlo');

	// Set up protocol handler to serve app content
	protocol.handle('marlo', (request) => {
		const url = new URL(request.url);

		// Handle auth URLs (existing functionality)
		if (url.hostname === 'auth') {
			// This is handled by the existing open-url handler
			return new Response('', { status: 204 });
		}

		// Serve app content from hostname 'app'
		if (url.hostname === 'app') {
			// Handle root paths and _astro assets locally
			if (
				url.pathname === '/' ||
				url.pathname === '/index.html' ||
				url.pathname === '/login' ||
				url.pathname.includes('/_astro')
			) {
				let filePath;
				if (url.pathname === '/') {
					filePath = '/index.html';
				} else if (url.pathname === '/login') {
					filePath = '/login.html';
				} else {
					// Remove astro-electron prefix if present
					filePath = url.pathname.replace('/astro-electron', '');
				}

				const fullPath = app.isPackaged
					? path.join(process.resourcesPath, 'client', filePath.substring(1))
					: path.join(dirname, 'dist', filePath.substring(1));

				// Use net.fetch to serve the file
				return net.fetch(`file://${fullPath}`);
			} else {
				// All other requests go to the backend
				const backendUrl = `${import.meta.env.PUBLIC_BACKEND_URL}${url.pathname}${url.search}`;

				// Get auth tokens and attach them as cookies
				const requestHeaders = new Headers(request.headers);
				attachAuthTokensToHeaders(requestHeaders);

				return net.fetch(backendUrl, {
					method: request.method,
					headers: requestHeaders,
					body: request.body,
					duplex: 'half',
				} as RequestInit);
			}
		}

		return new Response('Not found', { status: 404 });
	});

	session.defaultSession.webRequest.onBeforeSendHeaders(async (details, callback) => {
		// Attach cookies wiht auth tokens to requests to the backend, marlo.so or localhost:5001 (in dev)
		const shouldAttachTokens =
			details.url.includes('marlo.so') ||
			(!app.isPackaged && details.url.includes('localhost:5001'));

		if (shouldAttachTokens) {
			const requestHeaders = { ...details.requestHeaders };
			attachAuthTokensToRequestHeaders(requestHeaders);
			callback({ requestHeaders });
		} else {
			callback({});
		}
	});

	// Initialize auto-updater after app is ready
	if (app.isPackaged) {
		autoUpdater.checkForUpdatesAndNotify();

		// TODO block if there is a new version
	}

	const mainWindow = createWindow();

	// Setup IPC handlers
	setupGlobalIPC(mainWindow);

	// Handle window open requests
	mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
		// For now, open in external browser
		// Later we can create new tabs for same-origin URLs
		shell.openExternal(url);
		return { action: 'deny' };
	});

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});

	app.on('open-url', (_event, originalUrl) => {
		const url = new URL(originalUrl);

		// If auth
		if (url.protocol === 'marlo:' && url.hostname === 'auth') {
			const session = url.searchParams.get(SESSION_COOKIE_NAME);
			const refresh = url.searchParams.get(REFRESH_COOKIE_NAME);

			// Send login URL to the main window
			mainWindow.webContents.send('login', {
				session,
				refresh,
			});
			mainWindow.focus();
		}
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
	// Clean up global shortcuts
	globalShortcut.unregisterAll();
});
