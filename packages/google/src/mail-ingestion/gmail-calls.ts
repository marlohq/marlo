// Extracted methods from gmail to make them easier to test and mock.

import type { gmail_v1 } from 'googleapis';

export async function getGmailMessage(gmail: gmail_v1.Gmail, remoteId: string) {
	return await gmail.users.messages.get({
		id: remoteId,
		userId: 'me',
		format: 'raw', // TODO: When refetching an email we already have, we should consider using `format: 'minimal'` to save bandwidth.
	});
}

export async function listGmailLabels(gmail: gmail_v1.Gmail) {
	return await gmail.users.labels.list({
		userId: 'me',
	});
}

export async function listGmailHistory(
	gmail: gmail_v1.Gmail,
	startHistoryId: string,
	pageToken?: string,
) {
	return await gmail.users.history.list({
		userId: 'me',
		startHistoryId,
		pageToken,
		historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
	});
}

export async function sendGmailMessage(
	gmail: gmail_v1.Gmail,
	encoded: string,
	remoteThreadId?: string | null | undefined,
) {
	return await gmail.users.messages.send({
		userId: 'me',
		requestBody: {
			raw: encoded,
			threadId: remoteThreadId,
		},
	});
}
