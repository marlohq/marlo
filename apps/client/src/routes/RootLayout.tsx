import { isElectron } from '@workspace/core/electron.js';
import { Toaster } from '@workspace/ui';
import React from 'react';
import { Outlet } from 'react-router';
import { ChatDrawerProvider } from '../components/ChatDrawer/context.tsx';
import { ChatDrawer } from '../components/ChatDrawer/index.tsx';
import { CommandKeyboardListener } from '../components/CommandKeyboardListener.tsx';
import { CommandPaletteProvider } from '../components/CommandPalette/context.tsx';
import { CommandPalette } from '../components/CommandPalette/index.tsx';
import { RootLayoutSideNav } from '../components/RootLayoutSideNav.tsx';
import { SecurityDialogManager } from '../components/SecurityDialog.tsx';
import { TabBar } from '../components/TabBar/TabBar.tsx';
import { TabProvider } from '../contexts/TabContext.tsx';
import { useNotificationPermissions } from '../hooks/useNotificationPermissions.ts';
import { cn } from '../lib/util.ts';

export const Component = () => {
	useNotificationPermissions();

	const MaybeTabProvider = isElectron ? TabProvider : React.Fragment;

	return (
		<CommandPaletteProvider>
			<MaybeTabProvider>
				<ChatDrawerProvider>
					{isElectron && <TabBar />}
					<div
						className={cn('grid h-full max-h-screen w-full grid-cols-[60px_1fr] overflow-y-hidden')}
					>
						<RootLayoutSideNav />
						<div className="h-full w-full p-2 pl-0">
							<div
								className="relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-[#fcfcfc]"
								style={{ boxShadow: '0px 2px 2px -1px rgba(0,0,0,0.2)' }}
							>
								<Outlet />
							</div>
						</div>
					</div>
					<CommandPalette />
					<ChatDrawer />
					<CommandKeyboardListener />
					<SecurityDialogManager />
					<Toaster position="bottom-right" />
				</ChatDrawerProvider>
			</MaybeTabProvider>
		</CommandPaletteProvider>
	);
};
