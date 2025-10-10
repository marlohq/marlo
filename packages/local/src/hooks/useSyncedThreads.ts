import type { ThreadData } from '@workspace/sync-data/data.js';
import { useEffect } from 'react';
import { connection } from '../connection.ts';

export function useSyncedThreads(
	callback: (threads: ThreadData[]) => void,
	deps: React.DependencyList,
) {
	useEffect(() => {
		const handleThreads = (event: Event) => {
			const threadsEvent = event as CustomEvent & { threads: ThreadData[] };
			callback(threadsEvent.threads);
		};

		connection.addEventListener('threads', handleThreads);
		return () => connection.removeEventListener('threads', handleThreads);
		// biome-ignore lint/correctness/useExhaustiveDependencies: deps parameter is intentional for caller control
	}, deps);
}
