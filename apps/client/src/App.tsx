import { safe } from '@orpc/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { prependBackendUrl } from '@workspace/core/url.ts';
import { TooltipProvider } from '@workspace/ui';
import { RouterProvider } from 'react-router/dom';
import { AppConfigProvider } from './hooks/useAppConfig.tsx';
import { CurrentAccountProvider } from './hooks/useCurrentAccount.tsx';
import { SpacesProvider } from './hooks/useSpaces.tsx';
import { actions } from './lib/actions.ts';
import { queryClient } from './lib/tanstack.ts';
import { router } from './router.ts';

declare global {
	interface Window {
		deleteAllUserDataYesReally: () => Promise<void>;
		deleteAccount: () => Promise<void>;
	}
}

// For testing purposes only.
window.deleteAllUserDataYesReally = async () => {
	const result = await safe(actions.user.deleteAllUserDataYesReally({}));
	if (result.error) {
		console.error(result.error);
	} else {
		window.location.href = prependBackendUrl('/');
	}
};

window.deleteAccount = async () => {
	const result = await safe(actions.user.deleteAccount({}));
	if (result.error) {
		console.error(result.error);
	} else {
		window.location.href = prependBackendUrl('/');
	}
};

export function App({ desktopDownloadsEnabled = false }: { desktopDownloadsEnabled?: boolean }) {
	return (
		// @NOTE: Not sure where to put your provider / component?
		// Place all first-party code inside <StrictMode />.
		// Place all third-party code outside of <StrictMode />.
		<QueryClientProvider client={queryClient}>
			<AppConfigProvider config={{ desktopDownloadsEnabled }}>
				<TooltipProvider delayDuration={150}>
					<CurrentAccountProvider>
						<SpacesProvider>
							<RouterProvider router={router} />
						</SpacesProvider>
					</CurrentAccountProvider>
				</TooltipProvider>
			</AppConfigProvider>
		</QueryClientProvider>
	);
}
