import type { GmailClient } from '@workspace/google/request-client.js';
import { invariant } from 'es-toolkit';

export async function search(query: string, gmail: GmailClient, token?: string) {
	const response = await gmail.users.threads.list({
		userId: 'me',
		q: query,
		pageToken: token,
		maxResults: 50,
	});
	response.data.threads?.forEach((thread) => invariant(thread.id, 'thread.id is required'));
	const results = response.data.threads ?? [];
	return {
		results,
		nextPageToken: response.data.nextPageToken,
	};
}
