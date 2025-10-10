import * as Sentry from '@sentry/react';
import { useEffect } from 'react';
import {
	createBrowserRouter,
	createRoutesFromChildren,
	matchRoutes,
	useLocation,
	useNavigationType,
} from 'react-router';

Sentry.init({
	dsn: import.meta.env.SENTRY_CLIENT_DSN ?? import.meta.env.SENTRY_DSN,
	enabled: import.meta.env.PROD && Boolean(import.meta.env.SENTRY_CLIENT_DSN),
	integrations: [
		Sentry.reactRouterV6BrowserTracingIntegration({
			useEffect,
			useLocation,
			useNavigationType,
			createRoutesFromChildren,
			matchRoutes,
		}),
		Sentry.replayIntegration(),
	],
	// TODO(fks): Tweak these values as we get more data/users.
	// Long term there is no need to sample everything in production.
	tracesSampleRate: 1.0,
	replaysSessionSampleRate: 1.0,
	replaysOnErrorSampleRate: 1.0,
});

export function createInstrumentedBrowserRouter(...args: Parameters<typeof createBrowserRouter>) {
	const create = Sentry.wrapCreateBrowserRouterV6(createBrowserRouter);
	// Extract router options and add v7 future flags
	const [routes, options = {}] = args;
	const routerOptions = {
		...options,
		future: {
			...options.future,
			v7_relativeSplatPath: true,
			v7_startTransition: true,
			v7_fetcherPersist: true,
			v7_normalizeFormMethod: true,
			v7_partialHydration: true,
			v7_skipActionErrorRevalidation: true,
		},
	};
	return create(routes, routerOptions);
}

function captureUserContext(user: null | { id: string; email?: string; name?: string }) {
	if (!user) {
		Sentry.setUser(null);
	} else {
		Sentry.setUser({
			id: user.id,
			email: user.email,
			username: user.name,
		});
	}
}
