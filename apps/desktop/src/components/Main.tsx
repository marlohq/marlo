import { App } from '@workspace/client/App';
import { useEffect } from 'react';
import { useAuthJWTs } from '../lib/hooks.ts';

export default function Main() {
	const { session, isLoading } = useAuthJWTs();

	// Only redirect after loading is complete and we know there's no session
	useEffect(() => {
		if (!isLoading && !session) {
			window.location.href = '/login';
		}
	}, [session, isLoading]);

	// Show loading while checking auth state
	if (isLoading) {
		return <div>Loading...</div>;
	}

	return <>{session ? <App /> : null}</>;
}
