declare global {
	interface Window {
		electronAPI: {
			setAuthTokens: (tokens: { [key: string]: string | null }) => Promise<void>;
			getAuthTokens: () => Promise<{
				success: boolean;
				tokens?: { [key: string]: string };
				error?: string;
			}>;
			clearAuthTokens: () => Promise<{
				success: boolean;
				error?: string;
			}>;
			authSync: (sessionToken: string) => Promise<{
				success: boolean;
				data?: { syncjwt?: string; [key: string]: unknown };
				error?: string;
			}>;
			triggerLoginEvent: ({
				session,
				refresh,
			}: {
				session: string | null;
				refresh: string | null;
			}) => Promise<void>;
			onLogin: (
				callback: (user: { session: string | null; refresh: string | null }) => void,
			) => void;
			isPackaged: boolean;
		};
	}
}

export {};
