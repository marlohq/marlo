import { RiLogoutBoxRLine } from '@remixicon/react';
import { logoutAndRedirect } from '../../lib/logout.js';
import { defineCommand } from '../util.ts';

export const logoutCommand = defineCommand({
	shortcut: null,
	icon: RiLogoutBoxRLine,
	useAction() {
		return () => {
			return {
				label: (): string => {
					return 'Log out';
				},
				run: (): void => {
					logoutAndRedirect();
				},
			};
		};
	},
});

export default logoutCommand;
