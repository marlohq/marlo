import path from 'node:path';
import url from 'node:url';
import { app, BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';

const autoUpdater = electronUpdater.autoUpdater;
const dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Test mode for simulating updates in development
const SIMULATE_UPDATE = process.env.SIMULATE_UPDATE === 'true';

// Configure auto-updater
if (!app.isPackaged) {
	// In development, disable auto-updater
	autoUpdater.updateConfigPath = path.join(dirname, 'dev-app-update.yml');
}

// Track state
let splashWindow: BrowserWindow | null = null;

// Create a simple splash window for updates
const createSplashWindow = () => {
	splashWindow = new BrowserWindow({
		width: 400,
		height: 200,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		center: true,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// Simple HTML for splash screen
	splashWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(`
		<!DOCTYPE html>
		<html>
			<head>
				<style>
					body {
						margin: 0;
						padding: 0;
						font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
						background: rgba(0, 0, 0, 0);
						display: flex;
						align-items: center;
						justify-content: center;
						height: 100vh;
					}
					.container {
						background: white;
						border-radius: 12px;
						padding: 32px;
						box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
						text-align: center;
						min-width: 300px;
					}
					h1 {
						margin: 0 0 16px 0;
						font-size: 18px;
						font-weight: 600;
						color: #1f2937;
					}
					.progress-container {
						width: 100%;
						height: 6px;
						background: #e5e7eb;
						border-radius: 3px;
						overflow: hidden;
						margin: 16px 0;
					}
					.progress-bar {
						height: 100%;
						background: linear-gradient(90deg, #3b82f6, #2563eb);
						width: 0%;
						transition: width 0.3s ease;
					}
					.status {
						font-size: 14px;
						color: #6b7280;
						margin-top: 8px;
					}
					.error {
						color: #dc2626;
					}
					.button {
						margin-top: 16px;
						padding: 8px 16px;
						background: #3b82f6;
						color: white;
						border: none;
						border-radius: 6px;
						font-size: 14px;
						font-weight: 500;
						cursor: pointer;
						display: none;
					}
					.button:hover {
						background: #2563eb;
					}
					.button.visible {
						display: inline-block;
					}
				</style>
			</head>
			<body>
				<div class="container">
					<h1>Updating Marlo</h1>
					<div class="progress-container">
						<div class="progress-bar" id="progress"></div>
					</div>
					<div class="status" id="status">Checking for updates...</div>
					<button class="button" id="retryBtn" onclick="window.electronAPI?.retryUpdate()">Retry Update</button>
				</div>
				<script>
					window.electronAPI = {
						retryUpdate: () => {
							// Send message back to main process
							const event = new CustomEvent('retry-update');
							window.dispatchEvent(event);
						}
					};
				</script>
			</body>
		</html>
	`)}`,
	);

	return splashWindow;
};

const updateSplashProgress = (percent: number, status: string, showRetry = false) => {
	if (splashWindow && !splashWindow.isDestroyed()) {
		const isError = showRetry;
		splashWindow.webContents.executeJavaScript(`
			document.getElementById('progress').style.width = '${percent}%';
			const statusEl = document.getElementById('status');
			statusEl.textContent = '${status}';
			statusEl.className = 'status${isError ? ' error' : ''}';
			const retryBtn = document.getElementById('retryBtn');
			if (${showRetry}) {
				retryBtn.classList.add('visible');
			} else {
				retryBtn.classList.remove('visible');
			}
		`);
	}
};

const closeSplash = () => {
	if (splashWindow && !splashWindow.isDestroyed()) {
		splashWindow.close();
		splashWindow = null;
	}
};

// Simulate an update for testing in development
const simulateUpdate = async (onComplete: () => void) => {
	createSplashWindow();
	updateSplashProgress(0, 'Checking for updates...');

	await new Promise((resolve) => setTimeout(resolve, 1500));
	updateSplashProgress(0, 'Update found, downloading...');

	// Simulate download progress
	for (let i = 0; i <= 100; i += 5) {
		await new Promise((resolve) => setTimeout(resolve, 200));
		const speed = Math.floor(Math.random() * 2000) + 500;
		updateSplashProgress(i, `Downloading update... ${i}% (${speed} KB/s)`);
	}

	updateSplashProgress(100, 'Installing update...');
	await new Promise((resolve) => setTimeout(resolve, 1500));

	closeSplash();
	onComplete();
};

// Setup auto-updater event handlers
export const setupAutoUpdater = (onComplete: () => void) => {
	if (app.isPackaged) {
		autoUpdater.on('checking-for-update', () => {
			// Checking for update...
			if (!splashWindow) {
				createSplashWindow();
			}
			updateSplashProgress(0, 'Checking for updates...', false);
		});

		autoUpdater.on('update-available', (_info) => {
			// Update available - don't create window yet, wait for download
			updateSplashProgress(0, 'Update found, downloading...', false);
		});

		autoUpdater.on('update-not-available', (_info) => {
			// No update available, safe to create window
			closeSplash();
			onComplete();
		});

		autoUpdater.on('error', (err) => {
			// On error, show error message with retry button
			const errorMessage = err.message || 'Unknown error occurred';
			updateSplashProgress(0, `Update error: ${errorMessage}`, true);

			// Set up retry listener
			if (splashWindow && !splashWindow.isDestroyed()) {
				splashWindow.webContents.executeJavaScript(`
					document.getElementById('retryBtn').onclick = () => {
						window.location.reload();
					};
				`);

				// Listen for the retry button click
				splashWindow.webContents.on('will-navigate', (event) => {
					event.preventDefault();
					// Retry the update check
					closeSplash();
					autoUpdater.checkForUpdates();
				});
			}
		});

		autoUpdater.on('download-progress', (progressObj) => {
			// Downloading update...
			const percent = Math.round(progressObj.percent);
			const speed = Math.round(progressObj.bytesPerSecond / 1024);
			updateSplashProgress(percent, `Downloading update... ${percent}% (${speed} KB/s)`, false);
		});

		autoUpdater.on('update-downloaded', (_info) => {
			// Update downloaded, installing and restarting
			updateSplashProgress(100, 'Installing update...', false);
			// Immediately quit and install the update - no window is created
			setTimeout(() => {
				autoUpdater.quitAndInstall(false, true);
			}, 1000);
		});
	}
};

// Check for updates and block until complete
export const checkForUpdates = async (onComplete: () => void) => {
	if (SIMULATE_UPDATE) {
		// Simulate update flow for testing
		await simulateUpdate(onComplete);
	} else if (app.isPackaged) {
		// Check for updates first - window creation is blocked until update check completes
		await autoUpdater.checkForUpdates();
	} else {
		// In dev mode without simulation, immediately proceed
		onComplete();
	}
};
