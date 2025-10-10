import { RiShareForwardLine } from '@remixicon/react';
import type { MessageData } from '@workspace/sync-data/data.js';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useCurrentAccount } from '../../hooks/useCurrentAccount.tsx';
import { createDraft, createForwardQuoteHtml, type NewDraftData } from '../../lib/draft.ts';
import { ClientMessage } from '../../models/message.ts';
import type { ClientThread } from '../../threads/model.ts';
import { defineCommand, useThreadsFromContext } from '../util.ts';

export function getDefaultForwardRecipients(): Pick<NewDraftData, 'to' | 'cc' | 'bcc'> {
	return {
		to: [],
		cc: [],
		bcc: [],
	};
}

export function getDefaultForwardFormData(message: MessageData): NewDraftData {
	return {
		...getDefaultForwardRecipients(),
		subject: `Fwd: ${message.subject}`,
		body: createForwardQuoteHtml(message),
		attachments: [],
	};
}

export const forwardCommand = defineCommand({
	shortcut: null,
	icon: RiShareForwardLine,
	useAction() {
		const currentAccount = useCurrentAccount();
		const contextThreads = useThreadsFromContext();
		const location = useLocation();
		const navigate = useNavigate();
		return (inlineThreads?: ClientThread[]) => {
			return {
				label: () => 'Forward',
				run: async () => {
					const threads = inlineThreads ?? contextThreads ?? [];
					const thread = threads[0];
					if (!thread || threads.length !== 1) {
						toast.warning('Please select exactly one thread to reply to.');
						return;
					}

					const lastMessageData = thread.messages.filter((m) => !m.draftId && !m.deletedAt).at(-1);
					if (!lastMessageData) {
						toast.error('No messages found in thread');
						return;
					}
					const targetMessage = new ClientMessage(thread, lastMessageData);

					// If there is a draft, we don't need to create a new one.
					const replyDraftMessage = targetMessage.replyDraftMessages()[0];
					if (!replyDraftMessage) {
						await createDraft({
							account: currentAccount,
							data: getDefaultForwardFormData(targetMessage.data),
							parentThreadId: targetMessage.data.threadId,
							inReplyTo: targetMessage.data.globalId,
						});
					}

					// Navigate to thread details if not already there
					const threadDetailsPath = `/threads/${thread.id}`;
					if (location.pathname !== threadDetailsPath) {
						navigate(threadDetailsPath);
					}
				},
			};
		};
	},
});

export default forwardCommand;
