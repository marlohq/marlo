import path from 'node:path';
import url from 'node:url';
import { REFRESH_COOKIE_NAME, SESSION_COOKIE_NAME } from '@workspace/core/cookies.js';
import { app, BrowserWindow, globalShortcut, net, protocol, session, shell } from 'electron';
import { attachAuthTokensToHeaders, attachAuthTokensToRequestHeaders } from './auth.js';
import { checkForUpdates, setupAutoUpdater } from './auto-update.js';
import { DEV_BASE_URL } from './consts.js';
import { setupGlobalIPC } from './ipc.js';
import { setupApplicationMenu } from './menu.js';

const dirname = path.dirname(url.fileURLToPath(import.meta.url));

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

	mainWindow.loadURL(app.isPackaged ? `${PROTOCOL_SCHEME}://app/` : DEV_BASE_URL);
	setupApplicationMenu();

	return mainWindow;
};

// Use different protocol for dev vs production
const PROTOCOL_SCHEME = app.isPackaged ? 'marlo' : 'marlo-dev';

// Register protocol privileges before app ready
protocol.registerSchemesAsPrivileged([
	{
		scheme: PROTOCOL_SCHEME,
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
		app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

app.whenReady().then(async () => {
	// Set the application name for menus and about dialog
	app.setName('Marlo');

	// Set up protocol handler to serve app content
	protocol.handle(PROTOCOL_SCHEME, (request) => {
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

	// Track the main window reference
	let mainWindow: BrowserWindow | null = null;

	// Setup window event handlers
	const setupWindowHandlers = (window: BrowserWindow) => {
		// Handle window open requests
		window.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
			// For now, open in external browser
			// Later we can create new tabs for same-origin URLs
			shell.openExternal(url);
			return { action: 'deny' };
		});

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				mainWindow = createWindow();
				setupGlobalIPC(mainWindow);
				setupWindowHandlers(mainWindow);
			}
		});

		app.on('open-url', (_event, originalUrl) => {
			const url = new URL(originalUrl);

			// If auth - check both protocols
			if ((url.protocol === 'marlo:' || url.protocol === 'marlo-dev:') && url.hostname === 'auth') {
				const session = url.searchParams.get(SESSION_COOKIE_NAME);
				const refresh = url.searchParams.get(REFRESH_COOKIE_NAME);

				// Send login URL to the main window
				if (mainWindow && !mainWindow.isDestroyed()) {
					mainWindow.webContents.send('login', {
						session,
						refresh,
					});
					mainWindow.focus();
				}
			}
		});
	};

	// Setup auto-updater event handlers
	setupAutoUpdater(() => {
		// Called when update check is complete and it's safe to create window
		mainWindow = createWindow();
		setupGlobalIPC(mainWindow);
		setupWindowHandlers(mainWindow);
	});

	// Check for updates - blocks until complete (or creates window if no update needed)
	await checkForUpdates(() => {
		// Called when update check is complete and it's safe to create window
		mainWindow = createWindow();
		setupGlobalIPC(mainWindow);
		setupWindowHandlers(mainWindow);
	});
});

app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
	// Clean up global shortcuts
	globalShortcut.unregisterAll();
});
