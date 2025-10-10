import type { ThreadData } from '../schema.ts';

export type ThreadView =
	| 'spam'
	| 'trash'
	| 'resolved'
	| 'priority'
	| 'triage'
	| `space:${string}`
	| 'deleted';

export function getThreadView(thread: ThreadData): ThreadView {
	if (thread.spammedAt) return 'spam';
	if (thread.deletedAt) return 'deleted';
	if (thread.trashedAt) return 'trash';
	if (thread.resolvedAt) return 'resolved';
	if (!thread.spaceId) return 'triage';
	if (thread.spaceId.startsWith('inbox_')) return 'priority';
	return `space:${thread.spaceId}`;
}

/**
 * NOTE: Dexie doesn't index booleans, so we return `1` to index drafts and `false` to skip indexing
 * threads without drafts.
 */
export function getThreadHasDraft(thread: ThreadData): 1 | false {
	return thread.messages.some((m) => !!m.draftId && !m.deletedAt) ? 1 : false;
}
