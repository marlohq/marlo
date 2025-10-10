import type { CategoryId } from '@workspace/categories/types.js';
import type { Database } from '@workspace/local/database.ts';

export const DEFAULT_THREAD_PAGE_SIZE_LIMIT = 200;
export const DEFAULT_THREAD_QUERY_LIMIT = 2500;

export function getAllMailQuery(db: Database) {
	return db.threads.orderBy('data.lastSentAt').reverse();
}

export function getAllRemindersQuery(db: Database) {
	return db.threads.where('data.remindAt').notEqual('0').reverse();
}

export function getPriorityInboxQuery(db: Database) {
	return db.threads.where('view').equals('priority').reverse();
}

export function getTriageInboxQuery(db: Database) {
	return db.threads.where('view').equals('triage').reverse();
}

export function getDraftsQuery(db: Database) {
	return db.threads.where('hasDraft').equals(1).reverse();
}

export function getCustomSpacesQuery(db: Database) {
	return db.spaces
		.toCollection()
		.filter(
			(space) => !space.data.id.startsWith('inbox_') && !space.data.id.startsWith('reminders_'),
		);
}

export function listThreadsForAppQuery(db: Database, id: CategoryId) {
	return db.threads.where('data.category').equals(id).reverse();
}

export function threadQuery(db: Database, id: string) {
	return db.threads.where('data.id').equals(id);
}

export function threadsQuery(db: Database, ids: string[]) {
	if (ids.length === 0) {
		return db.threads.limit(0);
	} else {
		return db.threads.where('data.id').anyOf(ids);
	}
}

export function threadsRemoteIdsQuery(db: Database, remoteIds: string[]) {
	return db.threads.where('data.remoteId').anyOf(remoteIds).reverse();
}

function contactListQuery(db: Database, q: string, limit: number) {
	// We want to return nothing if the search query is empty.
	// Without this, the search query would return all contacts.
	if (q === '') {
		return db.contacts.limit(0);
	}
	return db.contacts.where('data.email').startsWith(q).limit(limit);
}

export async function contactAutocompleteQuery(
	db: Database,
	q: string,
	excludedAddresses: string[],
) {
	const normalizedQuery = q.toLowerCase().replace(/[^a-z0-9]/g, '');

	const contacts = await db.contacts
		.filter(
			(c) =>
				!excludedAddresses.includes(c.data.email) &&
				(c.data.email.includes(normalizedQuery) ||
					(typeof c.data.name === 'string' &&
						c.data.name?.toLowerCase().includes(normalizedQuery))),
		)
		.toArray();

	return contacts.sort((a, b) => (b.data.score || 0) - (a.data.score || 0)).slice(0, 3);
}
