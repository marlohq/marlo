import { useEffect, useState } from 'react';

export function useAuthJWTs() {
	const [values, setValues] = useState<{
		session: string | null;
		syncjwt: string | null;
		refresh: string | null;
	}>({
		session: null,
		syncjwt: null,
		refresh: null,
	});
	const [isLoading, setIsLoading] = useState(true);

	// Load tokens from IPC on mount
	useEffect(() => {
		const loadTokens = async () => {
			try {
				const result = await window.electronAPI.getAuthTokens();
				if (result.success && result.tokens) {
					setValues({
						session: result.tokens.session || null,
						syncjwt: result.tokens.syncjwt || null,
						refresh: result.tokens.refresh || null,
					});
				}
			} catch (error) {
				// Failed to load auth tokens - continue with null values
			} finally {
				setIsLoading(false);
			}
		};

		loadTokens();
	}, []);

	return { ...values, isLoading };
}
