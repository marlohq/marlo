import { safe } from '@orpc/client';
import { RiAccountBoxFill } from '@remixicon/react';
import type { AccountData } from '@workspace/sync-data/data.js';
import { toast } from 'sonner';
import { actions } from '../../lib/actions.ts';
import { defineCommand } from '../util.ts';

export const switchAccountCommand = defineCommand({
	shortcut: null,
	icon: RiAccountBoxFill,
	useAction() {
		return (account: AccountData) => {
			return {
				label: (): string => {
					return 'Switch Account';
				},
				run: async (): Promise<void> => {
					const result = await safe(
						actions.auth.switchAccount({
							accountId: account.id,
							desktop: window.electronAPI !== undefined,
						}),
					);
					if (result.error) {
						toast.error(result.error.toString());
					} else {
						if (window.electronAPI) {
							// We don't have access to the direct IPC listeners here, so we do this dance where we send this event to
							// the main process, which sends it back to the client. It's a bit wonky, but it works.
							await window.electronAPI.triggerLoginEvent({
								session: result.data.session ?? null,
								refresh: result.data.refresh ?? null,
							});
						} else {
							// On the web, cookies have been set by the server and we can just reload the page
							window.location.href = '/';
						}
					}
				},
			};
		};
	},
});

export default switchAccountCommand;
