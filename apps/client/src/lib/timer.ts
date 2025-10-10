// biome-ignore-all lint/correctness/useHookAtTopLevel: Usage here is correct.

import { captureException } from '@sentry/react';
import type { CategoryId } from '@workspace/categories/types.js';
import { createId } from '@workspace/core/util.js';
import type { QueryInfo } from '@workspace/local/query.ts';
import { useEffect, useMemo, useRef } from 'react';
import type { createBrowserRouter } from 'react-router';

const debugEnabled = () => localStorage.debug === 'true';

export const agentDebugger = {
	// Use an in-memory counter. If you click too fast you might not finish the previous timer.
	// But that's preferable to having the bookkeeping of storing each timer's start time.
	counter: 0,

	startClick(appId: CategoryId) {
		if (!debugEnabled()) return;
		this.counter++;
		const id = this.counter;
		console.log(`click-${appId}-${id}`);
		console.time(`click-${appId}-${id}`);
		return id;
	},

	useTimer(appId: CategoryId, info: Pick<QueryInfo, 'status'>) {
		if (!debugEnabled()) return;
		const id = useMemo(() => this.counter, []);
		useEffect(() => {
			// End the click timer right away.
			console.timeEnd(`click-${appId}-${id}`);
			// Start data timers.
			console.log(`data-initial-${appId}-${id}`);
			console.time(`data-complete-${appId}-${id}`);
		}, [appId, id]);

		useEffect(() => {
			if (info.status === 'complete') {
				console.timeEnd(`data-complete-${appId}-${id}`);
			}
		}, [appId, id, info.status]);
	},
};

type BrowserRouter = ReturnType<typeof createBrowserRouter>;
type RouterState = Parameters<Parameters<BrowserRouter['subscribe']>[0]>[0];

export const navigationDebugger = {
	MAX_DURATION: 100,
	navigationTimings: new Map<string, number>(),

	onRouterState(state: RouterState) {
		if (state.navigation.state === 'loading') {
			const key = state.navigation.location.pathname;
			this.navigationTimings.set(key, performance.now());
		} else if (state.navigation.state === 'idle') {
			const key = state.location.pathname;
			const startTime = this.navigationTimings.get(key);
			if (startTime) {
				const endTime = performance.now();
				const duration = endTime - startTime;
				this.navigationTimings.delete(key);

				if (duration > this.MAX_DURATION) {
					captureException(new Error(`Navigation to ${key} took ${duration.toFixed(2)}ms`));
				}
			}
		}
	},
};

export function useClickTimer(label: string) {
	if (!debugEnabled()) return { startClick: () => {}, log: () => {} };
	const id = useRef<string | null>(null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: This should not be an error.
	useEffect(() => {
		if (id.current) {
			console.timeEnd(`click-${label}-${id.current}`);
		}
	}, [label, id.current]);

	return {
		startClick: () => {
			id.current = createId();
			console.time(`click-${label}-${id.current}`);
			return id.current;
		},
		log: (message: string) => {
			if (id.current) {
				console.timeLog(`click-${label}-${id.current}`, message);
			}
		},
	};
}
