import { createContext, useContext } from 'react';

interface AppConfig {
	desktopDownloadsEnabled: boolean;
}

const AppConfigContext = createContext<AppConfig>({
	desktopDownloadsEnabled: false,
});

export function AppConfigProvider({
	children,
	config,
}: {
	children: React.ReactNode;
	config: AppConfig;
}) {
	return <AppConfigContext.Provider value={config}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
	return useContext(AppConfigContext);
}
