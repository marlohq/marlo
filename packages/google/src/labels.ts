import type { Gmail } from '@workspace/google/types.js';

export async function modifyRemoteLabels({
	gmail,
	remoteThreadId,
	remoteMessageId,
	add,
	remove,
}: {
	gmail: Gmail;
	remoteThreadId: string;
	remoteMessageId?: string;
	add: string[];
	remove: string[];
}): Promise<unknown> {
	// If both remoteMessageId and remoteThreadId are provided, we prefer the message ID.
	// This is because modifying a message is cheaper than modifying a thread when there's only one message in the thread.
	if (remoteMessageId) {
		return await gmail.users.messages.modify({
			id: remoteMessageId,
			userId: 'me',
			requestBody: {
				removeLabelIds: remove,
				addLabelIds: add,
			},
		});
	} else if (remoteThreadId) {
		return await gmail.users.threads.modify({
			id: remoteThreadId,
			userId: 'me',
			requestBody: {
				removeLabelIds: remove,
				addLabelIds: add,
			},
		});
	}
}
