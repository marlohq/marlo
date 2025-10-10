import Dexie, { type EntityTable, type Transaction } from 'dexie';
import { accountId } from './auth.ts';
import type {
	AccountSchema,
	AccountTable,
	ChatConversationTable,
	ContactTable,
	DraftTable,
	LabelTable,
	MetaTable,
	SignatureTable,
	SpaceTable,
	ThreadTable,
} from './schema.ts';
import { getThreadHasDraft, getThreadView } from './thread/view.ts';

export const NULL = '@@NULL@@';
export type NULL = typeof NULL;
// biome-ignore lint/suspicious/noExplicitAny: Needed to support types of old DB version migrations.
type OutdatedTableSchema = any;

export type { EntityTable as Table };
export type TableCollections = {
	meta: MetaTable;
	threads: ThreadTable;
	accounts: AccountTable;
	labels: LabelTable;
	contacts: ContactTable;
	drafts: DraftTable;
	signatures: SignatureTable;
	conversations: ChatConversationTable;
	spaces: SpaceTable;
};

export type Database = Dexie & TableCollections;

export function createDatabaseForAccount(accountId: string) {
	const dbName = `marlo-${accountId}`;
	const db = new Dexie(dbName) as Database;

	db.version(1).stores({
		meta: 'id, type',
		accounts: 'data.id',
		threads: `
            data.id,
            [view+data.lastSentAt],
            [all+data.lastSentAt],
            [sent+data.lastSentAt],
            [drafts+data.lastSentAt],
            [data.remoteId+data.lastSentAt],
            *appIds,
            *viewIds
        `,
		labels: 'data.id, data.type',
		contacts: 'data.id, data.email',
		appInstallations: 'data.id, data.appId',
		drafts: 'data.id',
		views: 'data.id, data.accountId, data.name',
		viewThreadTags: 'data.id, data.accountId, data.threadId, data.viewId',
		viewItems: 'data.id, data.accountId, data.viewId, data.type',
	});

	// 2025-03-27: Fix sync to be properly ordered.
	db.version(2).upgrade(triggerFullResync);
	// 2025-03-27: Bug in v2 caused metadata to not be deleted.
	db.version(3).upgrade(triggerFullResync);
	// 2025-03-27: Simplify agents, added full thread app tag data.
	db.version(4).upgrade(async (tx) => {
		await tx
			.table('threads')
			.toCollection()
			.modify((thread: OutdatedTableSchema) => {
				thread.data.apps.forEach((app: OutdatedTableSchema) => {
					if (!app.data) {
						app.data = {};
					}
				});
			});
		await triggerFullResync(tx);
	});
	// 2025-03-27: Added a new onboarding column to the account table, resync.
	db.version(5).upgrade(async (tx) => {
		await tx
			.table('accounts')
			.toCollection()
			.modify((account: AccountSchema) => {
				if (!account.data.onboarding) {
					account.data.onboarding = {};
				}
			});
		await triggerFullResync(tx);
	});
	// 2025-03-28: Removing an old property to save room in DB.
	db.version(6).upgrade(async (tx) => {
		await tx
			.table('threads')
			.toCollection()
			.modify((thread: OutdatedTableSchema) => {
				delete thread.apps;
			});
	});
	// 2025-03-28: Removing old tables from the DB, no longer used.
	db.version(7).stores({
		calendarEvents: null,
		githubPullRequests: null,
		newsletters: null,
		orderTracking: null,
		promotions: null,
		receipts: null,
	});
	// 2025-03-30: Replace AppMessageTags with AppThreadTags.
	db.version(8).upgrade(async (tx) => {
		await tx
			.table('threads')
			.toCollection()
			.modify((thread: OutdatedTableSchema) => {
				thread.data.apps.forEach((app: OutdatedTableSchema) => {
					delete app.messageId;
				});
			});
		await triggerFullResync(tx);
	});
	// 2025-04-21: Add conversations table.
	db.version(9).stores({
		conversations: 'data.id, data.threadId',
	});
	// 2025-04-25: Rebuild view index values.
	db.version(10).upgrade(async (tx) => {
		return tx
			.table('threads')
			.toCollection()
			.modify((thread) => {
				thread.view = getThreadView(thread.data);
				// thread.reminder = thread.data.remindAt ? 1 : 0;
				// biome-ignore lint/suspicious/noExplicitAny: allowed here, with runtime checking
				thread.drafts = thread.data.messages.some((m: any) => m && 'draftId' in m && m.draftId)
					? 1
					: 0;
			});
	});
	// 2025-04-29: Rebuild the new indexes for thread views (reminders and drafts).
	db.version(11).upgrade(triggerFullResync);
	// 2025-04-21: Reindex conversations by updatedAt.
	db.version(12).stores({
		conversations: 'data.id, data.updatedAt',
	});
	db.version(13)
		.stores({
			threads: `
            data.id,
            [view+data.lastSentAt],
            [all+data.lastSentAt],
            [sent+data.lastSentAt],
            [drafts+data.lastSentAt],
            [data.remoteId+data.lastSentAt],
            *appIds,
			*viewIds,
			*inReplyToIds
        `,
		})
		.upgrade(async (tx) => {
			await tx
				.table('threads')
				.toCollection()
				.modify((thread) => {
					// biome-ignore lint/suspicious/noExplicitAny: allowed here, with runtime checking
					thread.inReplyToIds = thread.data.messages.map((m: any) => m.inReplyTo).filter(Boolean);
				});
		});
	db.version(14).upgrade(triggerFullResync);
	// 2025-05-16: Fix drafts views.
	db.version(15).upgrade(triggerFullResync);
	// 2025-05-21: Add signature table.
	db.version(16).stores({
		signatures: 'data.id',
	});
	// 2025-05-22: Add Thread.triagedAt.
	db.version(17).upgrade(triggerFullResync);
	// 2025-06-10: Fix sent views.
	db.version(18).upgrade(triggerFullResync);
	// 2025-06-20: Remove appInstallations table.
	db.version(19).stores({
		appInstallations: null,
	});
	// 2025-06-24: Add ViewThreadTag and ViewItem tables.
	db.version(20)
		.stores({
			viewThreadTags: 'data.id, data.accountId, data.threadId, data.viewId',
			viewItems: 'data.id, data.accountId, data.viewId, data.type',
		})
		.upgrade(async (tx) => {
			await tx
				.table('threads')
				.toCollection()
				.modify((thread) => {
					thread.viewIds = thread.data.views?.map((v: { viewId: string }) => v.viewId) ?? [];
				});
		});

	// 2025-06-24: Fix bad migration in v20.
	db.version(21)
		.stores({
			viewThreadTags: 'data.id',
			viewItems: 'data.id, data.viewId',
		})
		.upgrade(triggerFullResync);

	// 2025-07-08: Schema migration changed the names of some nested properties, just full resync.
	db.version(22).upgrade(triggerFullResync);

	// 2025-07-09: Add support for labels pages and searching for labels.
	db.version(23)
		.stores({
			threads: `
			data.id,
			[view+data.lastSentAt],
			[all+data.lastSentAt],
			[sent+data.lastSentAt],
			[drafts+data.lastSentAt],
			[data.remoteId+data.lastSentAt],
			*appIds,
			*viewIds,
			*inReplyToIds,
			*labelIds`,
			labels: 'data.id, data.type, data.name',
		})
		.upgrade(async (tx) => {
			await tx
				.table('threads')
				.toCollection()
				.modify((thread) => {
					thread.labelIds = Array.from(
						new Set(
							// biome-ignore lint/suspicious/noExplicitAny: allowed here, with runtime checking
							thread.data.messages?.flatMap((m: any) => m.labels?.map((l: any) => l.labelId)),
						),
					);
				});
		});

	// 2025-07-15: Add views table.
	db.version(24)
		.stores({
			threads: `
			data.id,
			data.resolvedAt,
			data.lastSentAt,
			[view+data.lastSentAt],
			[data.remoteId+data.lastSentAt],
			*appIds,
			*viewIds,
			*inReplyToIds`,
			views: 'data.id, data.accountId, data.name',
		})
		.upgrade(triggerFullResync);

	// 2025-07-18: Views got renamed to spaces.
	db.version(25)
		.stores({
			threads: `
			data.id,
			data.resolvedAt,
			data.lastSentAt,
			[view+data.lastSentAt],
			[data.remoteId+data.lastSentAt],
			*appIds,
			*spaceIds,
			*inReplyToIds`,
			spaces: 'data.id, data.accountId, data.name',
			spaceThreadTags: 'data.id, data.accountId, data.threadId, data.spaceId',
			spaceItems: 'data.id, data.accountId, data.spaceId, data.type',
		})
		.upgrade(triggerFullResync);

	// 2025-07-21: Add spaceIds+view compound index.
	db.version(26).stores({
		threads: `
			data.id,
			data.resolvedAt,
			data.lastSentAt,
			[view+data.lastSentAt],
			[data.remoteId+data.lastSentAt],
			*appIds,
			*spaceIds,
			*inReplyToIds,
			[spaceIds+view]`,
	});

	// 2025-07-21: Rename AppThreadTag to ThreadCategory
	db.version(27).upgrade(triggerFullResync);

	// 2025-08-05: Add drafts view.
	db.version(28).upgrade(triggerFullResync);
	// 2025-08-14: Add remindAt index.
	db.version(29)
		.stores({
			threads: `
				data.id,
				data.resolvedAt,
				data.lastSentAt,
				[view+data.lastSentAt],
				[data.remoteId+data.lastSentAt],
				[data.remindAt+data.lastSentAt],
				*appIds,
				*spaceIds,
				*inReplyToIds,
				[spaceIds+view]`,
		})
		.upgrade(triggerFullResync);

	// 2025-08-19: Rename appIds to categoryIds.
	db.version(30)
		.stores({
			threads: `
			data.id,
			data.resolvedAt,
			data.lastSentAt,
			[view+data.lastSentAt],
			[data.remoteId+data.lastSentAt],
			*categoryIds,
			*viewIds,
			*inReplyToIds`,
			views: 'data.id, data.accountId, data.name',
		})
		.upgrade(triggerFullResync);

	// 2025-08-23: Remove categoryIds, spaceIds, spaceItems, spaceThreadTags.
	db.version(31)
		.stores({
			spaceItems: null,
			spaceThreadTags: null,
			threads: `
				data.id,
				data.resolvedAt,
				data.lastSentAt,
				[view+data.lastSentAt],
				[data.category+data.lastSentAt],
				[data.remoteId+data.lastSentAt],
				*viewIds,
				*inReplyToIds`,
		})
		.upgrade(triggerFullResync);

	// 2025-08-26: Add hasDraft property and index to replace VIEW_DRAFT.
	db.version(32)
		.stores({
			threads: `
				data.id,
				data.resolvedAt,
				data.lastSentAt,
				[view+data.lastSentAt],
				[hasDraft+data.lastSentAt],
				[data.category+data.lastSentAt],
				[data.remoteId+data.lastSentAt],
				*viewIds,
				*inReplyToIds`,
		})
		.upgrade(async (tx) => {
			await tx
				.table('threads')
				.toCollection()
				.modify((thread) => {
					thread.view = getThreadView(thread.data);
					thread.hasDraft = getThreadHasDraft(thread.data);
				});
		});

	// 2025-08-30: Add conversations table index on threadId.
	db.version(33)
		.stores({
			conversations: 'data.id, data.updatedAt, data.threadId',
		})
		.upgrade(triggerFullResync);

	// 2025-09-05: Switch Thread.view to string-based values, and clean up unneeded/missing indexes.
	db.version(34)
		.stores({
			threads: `
				data.id,
				data.resolvedAt,
				data.lastSentAt,
				[view+data.lastSentAt],
				[data.category+data.lastSentAt],
				[data.remoteId+data.lastSentAt],
				[data.remindAt+data.lastSentAt],
				[hasDraft+data.lastSentAt]`,
		})
		.upgrade(async (tx) => {
			await tx
				.table('threads')
				.toCollection()
				.modify((thread) => {
					thread.view = getThreadView(thread.data);
					delete thread.viewIds;
					delete thread.inReplyToIds;
				});
		});

	// 2025-09-25: Trigger resync so we have contact info for all threads.
	db.version(35).upgrade(triggerFullResync);

	return db;
}

function triggerFullResync(tx: Transaction) {
	return tx.table('meta').where('type').equals('updatedAt').delete();
}

const db = createDatabaseForAccount(accountId);

export function getDatabase() {
	return db;
}
