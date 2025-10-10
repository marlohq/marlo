import type { MessageData, ThreadData } from '@workspace/sync-data/data.js';
import { useEffect, useState } from 'react';
import { useSyncedThreads } from './hooks/useSyncedThreads.ts';
import { useConnectionStatus } from './query.ts';

export function useNotifications(callback: (thread: ThreadData, message: MessageData) => void) {
	const [hasInitialSync, setHasInitialSync] = useState(false);
	const [lastNotifiedAt, setLastNotifiedAt] = useState<Date>(new Date());
	const { connectionStatus } = useConnectionStatus();

	// Track when initial sync completes
	useEffect(() => {
		if (connectionStatus === 'synced' && !hasInitialSync) {
			setHasInitialSync(true);
		}
	}, [connectionStatus, hasInitialSync]);

	useSyncedThreads(
		(threads: ThreadData[]) => {
			if (!hasInitialSync) return; // Skip until synced

			let newestMessageDate = lastNotifiedAt;

			threads.forEach((thread) => {
				thread.messages.forEach((message) => {
					const messageSentAt = new Date(message.sentAt);

					// Only notify if message is newer than our last notification
					if (messageSentAt > lastNotifiedAt) {
						callback(thread, message);

						// Track the newest message date
						if (messageSentAt > newestMessageDate) {
							newestMessageDate = messageSentAt;
						}
					}
				});
			});

			// Update lastNotifiedAt to the newest message we processed
			if (newestMessageDate > lastNotifiedAt) {
				setLastNotifiedAt(newestMessageDate);
			}
		},
		[hasInitialSync, callback, lastNotifiedAt],
	);
}
