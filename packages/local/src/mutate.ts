import type {
	AccountData,
	ChatConversationData,
	ContactData,
	DraftData,
	LabelData,
	MessageData,
	SpaceActionData,
	SpaceData,
	ThreadData,
} from '@workspace/sync-data/data.js';
import type { Collection } from 'dexie';
import { connection } from './connection.js';
import { type Database, getDatabase, type TableCollections } from './database.js';
import { perf } from './perf.js';
import type {
	AccountSchema,
	ChatConversationSchema,
	ContactSchema,
	DraftSchema,
	LabelSchema,
	SpaceSchema,
	ThreadSchema,
} from './schema.js';
import threadOptions from './thread/index.js';
import { setByKeyPath } from './util.js';

type TypeWithId = { id: string };
type PartialWithId<T extends TypeWithId> = Omit<Partial<T>, 'id'> & Pick<T, 'id'>;

type MutatorInit<TData extends TypeWithId, TSchema> = {
	objectStore: keyof TableCollections;
	table:
		| 'Thread'
		| 'Account'
		| 'Contact'
		| 'Label'
		| 'ChatConversation'
		| 'Draft'
		| 'Space'
		| 'SpaceAction';
	createObject?(data: Omit<TData, 'updatedAt'>): TSchema;
};

type UpdateCallback<TData extends TypeWithId> = (data: TData) => TData;
type UpdateData<TData extends TypeWithId, TUpsert extends boolean = false> = TUpsert extends true
	? TData
	: Partial<TData> | UpdateCallback<TData>;

interface UpdateOptions {
	replace?: boolean;
}

const defaultUpdateOptions: Required<UpdateOptions> = {
	replace: false,
};

// Track the number of mutations in progress so that we can warn the user if they try to close the app while mutations are in progress.
let mutationCount = 0;

async function withMutationTracking<T>(promise: Promise<T>): Promise<T> {
	mutationCount++;
	return promise.finally(() => {
		mutationCount--;
	});
}

// Setup beforeunload handler once
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', (e) => {
		if (mutationCount > 0) {
			e.preventDefault();

			// For old browsers
			e.returnValue = true;
		}
	});
}

class Mutator<TData extends TypeWithId, TSchema> {
	#init: MutatorInit<TData, TSchema>;
	constructor(init: MutatorInit<TData, TSchema>) {
		this.#init = init;
	}

	async update(
		id: string,
		data: UpdateData<TData>,
		options: UpdateOptions = defaultUpdateOptions,
	): Promise<void> {
		const perfId = crypto.randomUUID();
		perf.time(`[PERF] mutator-update-${perfId}`);
		perf.log(`🔧 [PERF] Mutator.update START`, {
			perfId,
			table: this.#init.table,
			id,
			hasData: !!data,
		});
		const db = getDatabase();

		perf.time(`[PERF] mutator-modify-${perfId}`);
		const newData = await this.modify(db, id, data);
		perf.timeEnd(`[PERF] mutator-modify-${perfId}`);

		return this.syncUpdateToRemote(newData, options, perfId);
	}

	async syncUpdateToRemote(
		newData: PartialWithId<TData> | undefined,
		options: UpdateOptions = defaultUpdateOptions,
		perfId: string = '',
	) {
		if (newData) {
			const mutationId = crypto.randomUUID();

			perf.time(`[PERF] mutator-sendMessage-${perfId}`);
			connection.sendMessage({
				id: mutationId,
				type: 'mutation',
				action: 'update',
				// biome-ignore lint/suspicious/noExplicitAny: too hard to fix for now
				table: this.#init.table as any,
				data: newData,
				options: {
					...defaultUpdateOptions,
					...options,
				},
			});
			perf.timeEnd(`[PERF] mutator-sendMessage-${perfId}`);

			perf.time(`[PERF] mutator-waitForComplete-${perfId}`);
			await withMutationTracking(connection.waitForMutationComplete(mutationId));
			perf.timeEnd(`[PERF] mutator-waitForComplete-${perfId}`);
		}

		perf.timeEnd(`[PERF] mutator-update-${perfId}`);
		perf.log(`✅ [PERF] Mutator.update COMPLETE`, { perfId });
	}

	async bulkUpdate(updates: Array<{ key: string; changes: Partial<TData> }>) {
		const perfId = crypto.randomUUID();
		perf.time(`[PERF] mutator-bulkUpdate-${perfId}`);
		perf.log(`🔧 [PERF] Mutator.bulkUpdate START`, {
			perfId,
			table: this.#init.table,
			count: updates.length,
			keys: updates.map((u) => u.key),
		});

		try {
			const db = getDatabase();

			perf.time(`[PERF] mutator-bulkUpdate-fetch-${perfId}`);
			// Get each item by key
			const items = await db
				.table(this.#init.objectStore)
				.where('data.id')
				.anyOf(updates.map((update) => update.key))
				.toArray();
			perf.timeEnd(`[PERF] mutator-bulkUpdate-fetch-${perfId}`);

			perf.time(`[PERF] mutator-bulkUpdate-process-${perfId}`);
			// Go through each update and apply it to the item.
			// This supports nested objects and arrays through 'foo.bar': value syntax
			for (const update of updates) {
				const item = items.find((item) => item.data.id === update.key);
				if (!item) {
					throw new Error(`Item not found: ${update.key}`);
				}
				for (const [key, value] of Object.entries(update.changes)) {
					setByKeyPath(item.data, key, value);
				}
				const newData = this.#init.createObject?.(item.data) ?? { data: item.data };
				Object.assign(item, newData);
			}
			perf.timeEnd(`[PERF] mutator-bulkUpdate-process-${perfId}`);

			perf.time(`[PERF] mutator-bulkUpdate-put-${perfId}`);
			await db.table(this.#init.objectStore).bulkPut(items);
			perf.timeEnd(`[PERF] mutator-bulkUpdate-put-${perfId}`);

			const id = crypto.randomUUID();

			perf.time(`[PERF] mutator-bulkUpdate-sync-${perfId}`);
			connection.sendMessage({
				id,
				type: 'batch',
				table: this.#init.table,
				action: 'update',
				updates,
			});

			await withMutationTracking(connection.waitForMutationComplete(id));
			perf.timeEnd(`[PERF] mutator-bulkUpdate-sync-${perfId}`);

			perf.timeEnd(`[PERF] mutator-bulkUpdate-${perfId}`);
			perf.log(`✅ [PERF] Mutator.bulkUpdate COMPLETE`, { perfId });
		} catch (error) {
			perf.timeEnd(`[PERF] mutator-bulkUpdate-${perfId}`);
			perf.error(`❌ [PERF] Mutator.bulkUpdate ERROR`, { perfId, error });
			throw error;
		}
	}

	async create(data: Omit<TData, 'updatedAt'> & { updatedAt?: Date | string }) {
		const db = getDatabase();
		await this.put(db, data);
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'create',
			// biome-ignore lint/suspicious/noExplicitAny: too hard to fix for now
			table: this.#init.table as any,
			// biome-ignore lint/suspicious/noExplicitAny: too hard to fix for now
			data: data as any,
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}

	async delete(id: string) {
		const db = getDatabase();
		db[this.#init.objectStore].where('data.id').equals(id).delete();
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'delete',
			// biome-ignore lint/suspicious/noExplicitAny: too hard to fix for now
			table: this.#init.table as any,
			data: { id },
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}

	// Local only changes
	put(db: Database, data: Omit<TData, 'updatedAt'>) {
		const object = this.#init.createObject?.(data) ?? { data };
		// biome-ignore lint/suspicious/noExplicitAny: too hard to fix for now
		return db[this.#init.objectStore].put(object as any);
	}

	async modify(
		db: Database,
		id: string,
		data: UpdateData<TData>,
	): Promise<PartialWithId<TData> | undefined> {
		const modify = typeof data === 'function' ? data : (_d: TData) => data;
		let partialData: PartialWithId<TData> | undefined;
		// biome-ignore lint/suspicious/noExplicitAny: this is fine
		const collection = db[this.#init.objectStore].where('data.id').equals(id) as Collection<any>;
		await collection.modify((existingSchema: { data: TData }) => {
			partialData = {
				id: existingSchema.data.id,
				...modify(existingSchema.data),
			};
			const newData = Object.assign(existingSchema.data, partialData);
			Object.assign(existingSchema, this.#init.createObject?.(newData) ?? { data: newData });
		});
		return partialData;
	}
}

class MessageMutator {
	async update(
		threadId: string,
		id: string,
		data: UpdateData<MessageData>,
		options: UpdateOptions = defaultUpdateOptions,
	) {
		const db = getDatabase();
		const newData = await this.modify(db, threadId, id, data);
		if (newData) {
			const mutationId = crypto.randomUUID();
			connection.sendMessage({
				id: mutationId,
				type: 'mutation',
				action: 'update',
				table: 'Message',
				data: {
					...newData,
					threadId,
				},
				options: {
					...defaultUpdateOptions,
					...options,
				},
			});

			return withMutationTracking(connection.waitForMutationComplete(mutationId));
		}
	}

	async bulkUpdate(threads: ThreadData[], data: Partial<MessageData>) {
		const db = getDatabase();

		const ids: { id: string; threadId: string }[] = [];
		const updates = [];

		for (const thread of threads) {
			for (const message of thread.messages) {
				Object.assign(message, data);
				ids.push({ id: message.id, threadId: thread.id });
			}
			updates.push(threadOptions.createObject(thread));
		}

		await db.threads.bulkPut(updates);

		const id = crypto.randomUUID();
		connection.sendMessage({
			id,
			type: 'batch',
			action: 'update',
			table: 'Message',
			updates: ids.map(({ id: messageId }) => ({ key: messageId, changes: data })),
		});

		return withMutationTracking(connection.waitForMutationComplete(id));
	}

	async create(threadId: string, data: MessageData) {
		const db = getDatabase();
		await this.append(db, threadId, data);
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'create',
			table: 'Message',
			data,
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}

	async delete(threadId: string, id: string) {
		const db = getDatabase();
		await this.remove(db, threadId, id);
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'delete',
			table: 'Message',
			data: { id },
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}
	// Local only changes
	async modify(
		db: Database,
		threadId: string,
		id: string,
		data: UpdateData<MessageData>,
	): Promise<PartialWithId<MessageData> | undefined> {
		let newData: PartialWithId<MessageData> | undefined;
		await db.threads
			.where('data.id')
			.equals(threadId)
			.modify((thread) => {
				const message = thread.data.messages.find((m) => m.id === id);
				if (!message) {
					throw new Error(`Message not found: ${id}`);
				}
				const d = typeof data === 'function' ? data : (_d: MessageData) => data;
				newData = {
					id: message.id,
					...d(message),
				};
				Object.assign(message, newData);
				// Causes all thread indexes to be updated
				Object.assign(thread, threadOptions.createObject(thread.data));
			});
		return newData;
	}

	async append(db: Database, threadId: string, data: MessageData) {
		await db.threads
			.where('data.id')
			.equals(threadId)
			.modify((thread) => {
				thread.data.messages.push(data);
			});
	}

	async remove(db: Database, threadId: string, id: string) {
		await db.threads
			.where('data.id')
			.equals(threadId)
			.modify((thread) => {
				thread.data.messages = thread.data.messages.filter((m) => m.id !== id);
			});
	}
}

class ActionMutator {
	async update(
		viewId: string,
		id: string,
		data: UpdateData<SpaceActionData>,
		options: UpdateOptions = defaultUpdateOptions,
	) {
		const db = getDatabase();
		const newData = await this.modify(db, viewId, id, data);
		if (newData) {
			const mutationId = crypto.randomUUID();
			connection.sendMessage({
				id: mutationId,
				type: 'mutation',
				action: 'update',
				table: 'SpaceAction',
				data: {
					...newData,
					spaceId: viewId,
				},
				options: {
					...defaultUpdateOptions,
					...options,
				},
			});

			return withMutationTracking(connection.waitForMutationComplete(mutationId));
		}
	}

	async bulkUpdate(views: SpaceData[], data: Partial<SpaceActionData>) {
		const db = getDatabase();

		const actionIds: string[] = [];
		const updates = [];

		for (const view of views) {
			for (const action of view.actions) {
				Object.assign(action, data);
				actionIds.push(action.id);
			}
			updates.push({ data: view });
		}

		await db.spaces.bulkPut(updates);

		const id = crypto.randomUUID();
		connection.sendMessage({
			id,
			type: 'batch',
			action: 'update',
			table: 'SpaceAction',
			updates: actionIds.map((actionId) => ({ key: actionId, changes: data })),
		});

		return withMutationTracking(connection.waitForMutationComplete(id));
	}

	async create(viewId: string, data: SpaceActionData) {
		const db = getDatabase();
		await this.append(db, viewId, data);
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'create',
			table: 'SpaceAction',
			data,
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}

	async delete(viewId: string, id: string) {
		const db = getDatabase();
		await this.remove(db, viewId, id);
		const mutationId = crypto.randomUUID();
		connection.sendMessage({
			id: mutationId,
			type: 'mutation',
			action: 'delete',
			table: 'SpaceAction',
			data: { id },
		});

		return withMutationTracking(connection.waitForMutationComplete(mutationId));
	}

	// Local only changes
	async modify(
		db: Database,
		viewId: string,
		id: string,
		data: UpdateData<SpaceActionData>,
	): Promise<PartialWithId<SpaceActionData> | undefined> {
		let newData: PartialWithId<SpaceActionData> | undefined;
		await db.spaces
			.where('data.id')
			.equals(viewId)
			.modify((view) => {
				// Initialize actions array if it doesn't exist
				if (!view.data.actions) {
					view.data.actions = [];
				}
				const action = view.data.actions.find((a) => a.id === id);
				if (!action) {
					throw new Error(`Action not found: ${id}`);
				}
				const d = typeof data === 'function' ? data : (_d: SpaceActionData) => data;
				newData = {
					id: action.id,
					...d(action),
				};
				Object.assign(action, newData);
			});
		return newData;
	}

	async append(db: Database, viewId: string, data: SpaceActionData) {
		await db.spaces
			.where('data.id')
			.equals(viewId)
			.modify((view) => {
				// Initialize actions array if it doesn't exist
				if (!view.data.actions) {
					view.data.actions = [];
				}
				view.data.actions.push(data);
			});
	}

	async remove(db: Database, viewId: string, id: string) {
		await db.spaces
			.where('data.id')
			.equals(viewId)
			.modify((view) => {
				// Initialize actions array if it doesn't exist
				if (!view.data.actions) {
					view.data.actions = [];
				}
				view.data.actions = view.data.actions.filter((a) => a.id !== id);
			});
	}
}

const accountsMutator = new Mutator<AccountData, AccountSchema>({
	objectStore: 'accounts',
	table: 'Account',
});
const contactsMutator = new Mutator<ContactData, ContactSchema>({
	objectStore: 'contacts',
	table: 'Contact',
});
const threadMutator = new Mutator<ThreadData, ThreadSchema>(threadOptions);
const labelMutator = new Mutator<LabelData, LabelSchema>({
	objectStore: 'labels',
	table: 'Label',
});
const conversationMutator = new Mutator<ChatConversationData, ChatConversationSchema>({
	objectStore: 'conversations',
	table: 'ChatConversation',
});
const draftMutator = new Mutator<DraftData, DraftSchema>({
	objectStore: 'drafts',
	table: 'Draft',
});
const spaceMutator = new Mutator<SpaceData, SpaceSchema>({
	objectStore: 'spaces',
	table: 'Space',
});

export const mutate = {
	threads: threadMutator,
	messages: new MessageMutator(),
	actions: new ActionMutator(),
	labels: labelMutator,
	accounts: accountsMutator,
	contacts: contactsMutator,
	conversations: conversationMutator,
	drafts: draftMutator,
	spaces: spaceMutator,
};
