import { getAssetPath } from '@workspace/core/assets.ts';
import { useNotifications } from '@workspace/local/notifications.ts';
import type { MessageData, ThreadData } from '@workspace/sync-data/data.js';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

export function useNotificationPermissions() {
	const navigate = useNavigate();
	const pendingNotifications = useRef<{ thread: ThreadData; message: MessageData }[]>([]);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);

	// Request notification permission on first run
	useEffect(() => {
		// Check if we've already asked
		const hasAsked = localStorage.getItem('notification-permission-asked');

		if (!hasAsked && 'Notification' in window) {
			// Check current permission state
			if (Notification.permission === 'default') {
				// Request permission immediately
				Notification.requestPermission().then(() => {
					localStorage.setItem('notification-permission-asked', 'true');
				});
			}
		}
	}, []);

	// Set up notification listener with batching
	useNotifications((thread: ThreadData, message: MessageData) => {
		// Check both browser permission AND user preference
		const userEnabled = localStorage.getItem('notifications-enabled') !== 'false';

		if (Notification.permission === 'granted' && userEnabled) {
			// Add to pending notifications
			pendingNotifications.current.push({ thread, message });

			// Clear existing timeout
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			// Set new timeout to batch notifications
			timeoutRef.current = setTimeout(() => {
				const notifications = pendingNotifications.current;
				pendingNotifications.current = [];

				if (notifications.length === 0) return;

				if (notifications.length === 1) {
					// Single notification - show details
					const notificationItem = notifications[0];
					if (notificationItem) {
						const { thread, message } = notificationItem;
						const notification = new Notification(message.subject || 'New Email', {
							body: `From: ${message.senderName || message.senderEmail}\n${message.snippet || ''}`,
							icon: getAssetPath('/favicon.ico'),
							tag: thread.id,
						});

						notification.onclick = () => {
							window.focus();
							navigate(`/threads/${thread.id}`);
							notification.close();
						};
					}
				} else {
					// Multiple notifications - show batch summary
					const uniqueThreads = new Set(notifications.map((n) => n.thread.id));
					const notification = new Notification(`${notifications.length} New Emails`, {
						body: `From ${uniqueThreads.size} conversation${uniqueThreads.size === 1 ? '' : 's'}`,
						icon: getAssetPath('/favicon.ico'),
						tag: 'batch-notification',
					});

					notification.onclick = () => {
						window.focus();
						navigate('/'); // Navigate to inbox
						notification.close();
					};
				}
			}, 2000); // 2 second batching window
		}
	});

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, []);
}
