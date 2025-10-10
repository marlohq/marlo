import { RiExternalLinkLine } from '@remixicon/react';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export const openInGmailCommand = defineCommand({
	shortcut: { key: 'o', modifiers: [] },
	icon: RiExternalLinkLine,
	useAction() {
		const account = useCurrentAccount();
		const contextThreads = useThreadsFromContext();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: (): string => {
					return 'Open in Gmail';
				},
				run: (): void => {
					const threads = inlineThreads ?? contextThreads ?? [];
					for (const thread of threads) {
						window.open(thread.href(account.email));
					}
				},
			};
		};
	},
});

export default openInGmailCommand;
