import { RiBellFill, RiBellLine } from '@remixicon/react';
import { toast } from 'sonner';
import { defineCommand } from '../util.ts';

export const toggleNotificationsCommand = defineCommand({
	icon: RiBellLine,
	shortcut: null,
	useAction() {
		return () => {
			const enabled = localStorage.getItem('notifications-enabled') !== 'false';

			return {
				label: (): string => {
					return enabled ? 'Disable notifications' : 'Enable notifications';
				},
				icon: enabled ? RiBellFill : RiBellLine,
				run: async (): Promise<void> => {
					const newState = !enabled;
					localStorage.setItem('notifications-enabled', String(newState));

					// If enabling and permission not granted, request it
					if (newState && 'Notification' in window && Notification.permission === 'default') {
						const permission = await Notification.requestPermission();
						if (permission === 'denied') {
							toast.error('Browser notifications are blocked. Please enable in browser settings.');
							return;
						}
					}

					toast.success(newState ? 'Notifications enabled' : 'Notifications disabled');
				},
			};
		};
	},
});

export default toggleNotificationsCommand;
