import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';

/** Set up custom application menu for single window app */
export function setupApplicationMenu(): void {
	const template = [
		// macOS specific app menu
		...(process.platform === 'darwin'
			? [
					{
						label: app.getName(),
						submenu: [
							{ role: 'about' },
							{ type: 'separator' },
							{ role: 'services' },
							{ type: 'separator' },
							{ role: 'hide' },
							{ role: 'hideOthers' },
							{ role: 'unhide' },
							{ type: 'separator' },
							{ role: 'quit' },
						],
					},
				]
			: []),

		// File menu
		{
			label: 'File',
			submenu: [
				{
					label: 'New Window',
					accelerator: 'CmdOrCtrl+N',
					click: () => {
						// You could implement new window functionality here if needed
						// For now, we'll keep it simple with just one window
					},
				},
				{ type: 'separator' },
				...(process.platform === 'darwin' ? [] : [{ role: 'quit' }]),
			],
		},

		// Edit menu
		{
			label: 'Edit',
			submenu: [
				{ role: 'undo' },
				{ role: 'redo' },
				{ type: 'separator' },
				{ role: 'cut' },
				{ role: 'copy' },
				{ role: 'paste' },
				...(process.platform === 'darwin'
					? [
							{ role: 'pasteAndMatchStyle' },
							{ role: 'delete' },
							{ role: 'selectAll' },
							{ type: 'separator' },
							{
								label: 'Speech',
								submenu: [{ role: 'startSpeaking' }, { role: 'stopSpeaking' }],
							},
						]
					: [{ role: 'delete' }, { type: 'separator' }, { role: 'selectAll' }]),
			],
		},

		// View menu
		{
			label: 'View',
			submenu: [
				{
					label: 'Reload',
					accelerator: 'CmdOrCtrl+R',
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.reload();
						}
					},
				},
				{
					label: 'Force Reload',
					accelerator: 'CmdOrCtrl+Shift+R',
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.reloadIgnoringCache();
						}
					},
				},
				{
					label: 'Toggle Developer Tools',
					accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
					click: () => {
						const focusedWindow = BrowserWindow.getFocusedWindow();
						if (focusedWindow) {
							focusedWindow.webContents.toggleDevTools();
						}
					},
				},
				{ type: 'separator' },
				{ role: 'resetZoom' },
				{ role: 'zoomIn' },
				{ role: 'zoomOut' },
				{ type: 'separator' },
				{ role: 'togglefullscreen' },
			],
		},

		// Window menu
		{
			label: 'Window',
			submenu: [
				{ role: 'minimize' },
				{ role: 'close' },
				...(process.platform === 'darwin'
					? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
					: []),
			],
		},

		// Help menu
		{
			role: 'help',
			submenu: [
				{
					label: 'About Marlo',
					click: () => {
						// Could open about dialog or navigate to about page
					},
				},
			],
		},
	];

	const menu = Menu.buildFromTemplate(template as MenuItemConstructorOptions[]);
	Menu.setApplicationMenu(menu);
}
