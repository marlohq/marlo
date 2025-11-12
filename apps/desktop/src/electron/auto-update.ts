import path from 'node:path';
import url from 'node:url';
import { app, BrowserWindow, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';

const autoUpdater = electronUpdater.autoUpdater;
const dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Configure auto-updater for development
if (!app.isPackaged) {
	autoUpdater.updateConfigPath = path.join(dirname, 'dev-app-update.yml');
}

// State management
let splashWindow: BrowserWindow | null = null;
let splashWindowReady = false;

// Create and display splash window for update progress
const createSplashWindow = async () => {
	splashWindowReady = false;
	splashWindow = new BrowserWindow({
		width: 400,
		height: 200,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		resizable: false,
		center: true,
		webPreferences: {
			nodeIntegration: true,
			contextIsolation: false,
		},
	});

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
					.button.secondary {
						background: #6b7280;
						margin-left: 8px;
					}
					.button.secondary:hover {
						background: #4b5563;
					}
					.button-group {
						display: flex;
						justify-content: center;
						gap: 8px;
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
					<div class="button-group">
						<button class="button" id="retryBtn">Retry Update</button>
						<button class="button secondary" id="exitBtn">Exit</button>
					</div>
				</div>
				<script>
					const { ipcRenderer } = require('electron');
					document.getElementById('retryBtn')?.addEventListener('click', () => {
						ipcRenderer.send('update-retry');
					});
					document.getElementById('exitBtn')?.addEventListener('click', () => {
						ipcRenderer.send('update-exit');
					});
				</script>
			</body>
		</html>
	`)}`,
	);

	// Wait for DOM to be ready, otherwise sending JavaScript might fail
	await new Promise<void>((resolve) => {
		if (!splashWindow) {
			resolve();
			return;
		}
		splashWindow.webContents.on('did-finish-load', () => {
			splashWindowReady = true;
			resolve();
		});
	});

	return splashWindow;
};

// Update splash window progress bar and status
const updateSplashProgress = (percent: number, status: string, showRetry = false) => {
	if (!splashWindow?.webContents || splashWindow.isDestroyed() || !splashWindowReady) return;

	splashWindow.webContents
		.executeJavaScript(
			`
		(() => {
			const progress = document.getElementById('progress');
			const statusEl = document.getElementById('status');
			const retryBtn = document.getElementById('retryBtn');
			const exitBtn = document.getElementById('exitBtn');

			if (progress) progress.style.width = '${percent}%';
			if (statusEl) {
				statusEl.textContent = '${status}';
				statusEl.className = 'status${showRetry ? ' error' : ''}';
			}
			if (retryBtn) {
				retryBtn.className = 'button${showRetry ? ' visible' : ''}';
			}
			if (exitBtn) {
				exitBtn.className = 'button secondary${showRetry ? ' visible' : ''}';
			}
		})();
	`,
		)
		.catch(() => {
			// Ignore errors
		});
};

// Close splash window
const closeSplash = () => {
	if (splashWindow?.isDestroyed() === false) {
		splashWindow.close();
		splashWindow = null;
		splashWindowReady = false;
	}
};

// Setup auto-updater event handlers
export const setupAutoUpdater = (onComplete: () => void) => {
	if (!app.isPackaged) return;

	autoUpdater.on('checking-for-update', async () => {
		if (!splashWindow) {
			await createSplashWindow();
		}
		updateSplashProgress(0, 'Checking for updates...');
	});

	autoUpdater.on('update-available', () => {
		updateSplashProgress(0, 'Update found, downloading...');
	});

	autoUpdater.on('update-not-available', () => {
		closeSplash();
		onComplete();
	});

	autoUpdater.on('error', (err) => {
		const errorMessage = err.message || 'Unknown error occurred';
		updateSplashProgress(0, `Update error: ${errorMessage}`, true);

		// Setup retry handler
		const retryHandler = () => {
			closeSplash();
			autoUpdater.checkForUpdates();
		};

		// Setup exit handler
		const exitHandler = () => {
			closeSplash();
			app.quit();
		};

		ipcMain.once('update-retry', retryHandler);
		ipcMain.once('update-exit', exitHandler);

		// Clean up if window closes
		splashWindow?.once('closed', () => {
			ipcMain.removeListener('update-retry', retryHandler);
			ipcMain.removeListener('update-exit', exitHandler);
		});
	});

	autoUpdater.on('download-progress', (progressObj) => {
		const percent = Math.round(progressObj.percent);
		const speed = Math.round(progressObj.bytesPerSecond / 1024);
		updateSplashProgress(percent, `Downloading update... ${percent}% (${speed} KB/s)`);
	});

	autoUpdater.on('update-downloaded', () => {
		updateSplashProgress(100, 'Installing update...');
		setTimeout(() => {
			autoUpdater.quitAndInstall(false, true);
		}, 1000);
	});
};

// Check for updates and handle accordingly
export const checkForUpdates = async (onComplete: () => void) => {
	if (app.isPackaged) {
		await autoUpdater.checkForUpdates();
	} else {
		onComplete();
	}
};
