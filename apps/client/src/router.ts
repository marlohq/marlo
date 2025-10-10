import { type LoaderFunctionArgs, redirect } from 'react-router';
import { idleUntilUrgent } from './lib/idle-until-urgent.ts';
import { createInstrumentedBrowserRouter } from './lib/instrument.ts';
import { navigationDebugger } from './lib/timer.ts';

export const router = createInstrumentedBrowserRouter([
	{
		loader: ({ request }: LoaderFunctionArgs) => {
			// Enforce no trailing slashes in the URL pathname.
			const url = new URL(request.url);
			if (url.pathname.endsWith('/') && url.pathname !== '/') {
				url.pathname = url.pathname.slice(0, -1);
				return redirect(url.href);
			}
			// Side-effectual loaders should return null.
			return null;
		},
		children: [
			{
				lazy: idleUntilUrgent(() => import('./routes/RootLayout.tsx')),
				children: [
					{
						index: true,
						lazy: idleUntilUrgent(() => import('./routes/PriorityInbox.tsx')),
					},
					{
						path: 'triage',
						lazy: idleUntilUrgent(() => import('./routes/TriageInbox.tsx')),
					},
					{
						path: 'triage/inbox-zero',
						lazy: idleUntilUrgent(() => import('./routes/TriageFlow.tsx')),
					},
					{
						path: 'apps/:id',
						lazy: idleUntilUrgent(() => import('./routes/AppDetails.tsx')),
					},
					{
						path: 'search',
						lazy: idleUntilUrgent(() => import('./routes/Search.tsx')),
					},
					{
						path: 'compose',
						lazy: idleUntilUrgent(() => import('./routes/Compose.tsx')),
					},
					{
						path: 'compose/:draftId',
						lazy: idleUntilUrgent(() => import('./routes/Compose.tsx')),
					},
					{
						path: 'threads/:threadId',
						lazy: idleUntilUrgent(() => import('./routes/ThreadDetails.tsx')),
					},
					{
						path: 'settings/integrations',
						lazy: idleUntilUrgent(() => import('./routes/IntegrationsPage.tsx')),
					},
					{
						path: 'spaces/:id',
						lazy: idleUntilUrgent(() => import('./routes/SpaceDetails.tsx')),
					},
					{
						path: 'spaces/:id/actions/:actionId/runs',
						lazy: idleUntilUrgent(() => import('./routes/ActionRuns.tsx')),
					},
				],
			},
		],
	},
	{
		path: 'threads/:threadId/print',
		lazy: () => import('./routes/ThreadPrintView.tsx'),
	},
]);

// Subscribe to navigation events to measure timing
router.subscribe((state) => navigationDebugger.onRouterState(state));
