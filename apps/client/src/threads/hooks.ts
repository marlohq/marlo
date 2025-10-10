import { useQuery } from '@workspace/local/query.ts';
import type { MessageData } from '@workspace/local/schema.js';
import { useEffect, useState } from 'react';
import { actions } from '../lib/actions.ts';
import { threadQuery, threadsQuery } from '../lib/queries.ts';
import { ClientThread } from './model.ts';

function useThread(id: string): ClientThread | undefined {
	const [data] = useQuery((db) => threadQuery(db, id).first());
	const thread = data ? new ClientThread(data.data) : undefined;
	return thread;
}

export function useThreads(ids: string[]): ClientThread[] {
	const [data] = useQuery((db) => threadsQuery(db, ids).toArray(), [ids.join(',')]);
	return data?.map((item) => new ClientThread(item.data)) ?? [];
}

function useThreadsSorted(ids: string[]): ClientThread[] {
	return useThreads(ids).sort((a, b) => b.lastSentAt.getTime() - a.lastSentAt.getTime());
}

export function useMessageContent(message: MessageData) {
	const defaultContent =
		message.contentHtml !== null && message.contentText !== null
			? { html: message.contentHtml, text: message.contentText }
			: null;
	const [content, setContent] = useState<{
		html: string;
		text: string;
	} | null>(defaultContent);
	const [isLoading, setIsLoading] = useState(!content);
	const [error, setError] = useState<Error | null>(null);

	useEffect(() => {
		if (content) return; // Skip if content is already loaded

		async function loadContent() {
			try {
				setIsLoading(true);
				const result = await actions.google.fetchContent({ remoteId: message.remoteId });
				setContent({
					html: result.contentHtml ?? '',
					text: result.contentText,
				});
			} catch (err) {
				console.error('Error loading message content:', err);
				setError(err instanceof Error ? err : new Error('Unknown error'));
			} finally {
				setIsLoading(false);
			}
		}

		loadContent();
	}, [message.remoteId, content]);

	return { content, isLoading, error };
}
