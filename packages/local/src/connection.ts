import type { ClientMessage } from '@workspace/sync-data/client-messages.ts';
import type { ThreadData } from '@workspace/sync-data/data.js';
import type { ClientSyncState, SyncableTable } from '@workspace/sync-data/schema.js';
import type { ServerMessage } from '@workspace/sync-data/server-messages.ts';
import { handleAccountError } from '@workspace/core/auth-error.js';
import { getJWT } from './auth.ts';
import { getDatabase } from './database.ts';
import { perf } from './perf.ts';
import {
	diffSchemas,
	getFieldSchema,
	type SchemaMetaSchema,
	type UpdatedAtMetaSchema,
} from './schema.ts';
import threadSchema from './thread/index.ts';

const RECONNECT_MIN_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;

async function waitForSuccessfulPing(socketUrl: string) {
	async function ping() {
		const socket = new WebSocket(socketUrl, 'marlo-ping');
		return new Promise<boolean>((resolve) => {
			function onOpen() {
				resolve(true);
				close();
			}
			function onError() {
				resolve(false);
				close();
			}
			function close() {
				socket.removeEventListener('open', onOpen);
				socket.removeEventListener('error', onError);
				socket.close();
			}
			socket.addEventListener('open', onOpen);
			socket.addEventListener('error', onError);
		});
	}
	// Immediate attempt first; if it works, connect right away.
	if (await ping()) {
		return;
	}
	// Exponential backoff with full jitter to prevent thundering herd.
	let currentBaseDelay = Math.max(0, RECONNECT_MIN_DELAY_MS);
	while (true) {
		if (document.visibilityState !== 'visible') {
			// Pause attempts when the tab is hidden; resume when shown.
			await waitForWindowShow();
			// After resuming visibility, try immediately.
			if (await ping()) {
				break;
			}
		} else {
			const cap = Math.min(
				RECONNECT_MAX_DELAY_MS,
				Math.max(RECONNECT_MIN_DELAY_MS, currentBaseDelay),
			);
			const jitterSleepMs = Math.floor(Math.random() * cap);
			await wait(jitterSleepMs);
			if (await ping()) {
				break;
			}
			currentBaseDelay = Math.min(
				RECONNECT_MAX_DELAY_MS,
				Math.max(RECONNECT_MIN_DELAY_MS, Math.floor(currentBaseDelay * RECONNECT_BACKOFF_FACTOR)),
			);
		}
	}
}

function wait(ms: number) {
	return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
function waitForWindowShow() {
	return new Promise<void>((resolve) => {
		const onChange = async () => {
			if (document.visibilityState === 'visible') {
				resolve();
				document.removeEventListener('visibilitychange', onChange);
			}
		};
		document.addEventListener('visibilitychange', onChange);
	});
}

export type ConnectionStatus = 'loading' | 'disconnected' | 'synced' | 'syncing';

class StatusEvent extends Event {
	constructor(public status: ConnectionStatus) {
		super('status');
	}
}

class ThreadsEvent extends Event {
	constructor(public threads: ThreadData[]) {
		super('threads');
	}
}

const rIC = typeof requestIdleCallback === 'function' ? requestIdleCallback : setTimeout;

class Connection extends EventTarget {
	private url: string;
	private socket: WebSocket;
	private queued = false;
	public status: ConnectionStatus = 'loading';
	public lastSynced: Date | null = null;
	private queuedMessages: ClientMessage[] = [];
	constructor(url: string) {
		super();
		this.url = url;
		const jwt = getJWT();
		this.socket = new WebSocket(this.url, jwt ? ['marlo-auth', jwt] : ['marlo-auth']);
		this.connect(this.socket);
	}

	connect(providedSocket?: WebSocket) {
		let socket = providedSocket;
		if (!socket) {
			const jwt = getJWT();
			socket = new WebSocket(this.url, jwt ? ['marlo-auth', jwt] : ['marlo-auth']);
		}
		this.socket = socket;
		this.socket.onopen = this.onopen;
		this.socket.onmessage = this.onmessage;
		this.socket.onclose = this.onclose;
		this.socket.onerror = this.onerror;
	}

	onopen = () => {
		this.setStatus('loading');
		this.flushQueue();
		this.initialSync();
	};

	onmessage = (event: MessageEvent) => {
		rIC(() => {
			this.handleMessage(event);
		});
	};

	handleMessage = async (event: MessageEvent) => {
		const message = JSON.parse(event.data) as ServerMessage;
		const db = getDatabase();
		switch (message.type) {
			case 'threads': {
				const updated = message.updated.map((thread) => {
					return threadSchema.createObject(thread);
				});

				// Dispatch event for notification system
				this.dispatchEvent(new ThreadsEvent(message.updated));

				const deleted = message.deleted.length > 0 ? message.deleted.map((data) => data.id) : null;
				await Promise.all([
					db.threads.bulkPut(updated),
					deleted && db.threads.bulkDelete(deleted),
					message.version && upsertTableMeta('Thread', message.version),
				]);
				return;
			}
			case 'labels': {
				const labels = message.labels.map((data) => {
					return { data };
				});
				await Promise.all([
					db.labels.bulkPut(labels),
					message.version && upsertTableMeta('Label', message.version),
				]);
				return;
			}
			case 'signatures': {
				const signatures = message.signatures.map((data) => {
					return { data };
				});
				await Promise.all([
					db.signatures.bulkPut(signatures),
					message.version && upsertTableMeta('Signature', message.version),
				]);
				return;
			}
			case 'drafts': {
				const updated = message.updated.map((data) => {
					return { data };
				});
				const deleted = message.deleted.length > 0 ? message.deleted.map((data) => data.id) : null;
				await Promise.all([
					db.drafts.bulkPut(updated),
					deleted && db.drafts.bulkDelete(deleted),
					message.version && upsertTableMeta('Draft', message.version),
				]);
				return;
			}
			case 'accounts': {
				const accounts = message.accounts.map((data) => {
					return { data };
				});
				await Promise.all([
					db.accounts.bulkPut(accounts),
					message.version && upsertTableMeta('Account', message.version),
				]);
				return;
			}
			case 'contacts': {
				const contacts = message.contacts.map((data) => {
					return { data };
				});
				await Promise.all([
					db.contacts.bulkPut(contacts),
					message.version && upsertTableMeta('Contact', message.version),
				]);
				return;
			}
			case 'conversations': {
				const conversations = message.conversations.map((data) => {
					return { data };
				});
				await Promise.all([
					db.conversations.bulkPut(conversations),
					message.version && upsertTableMeta('ChatConversation', message.version),
				]);
				return;
			}
			case 'spaces': {
				const updated = message.updated.map((data) => {
					return { data };
				});
				const deleted = message.deleted.length > 0 ? message.deleted.map((data) => data.id) : null;
				await Promise.all([
					db.spaces.bulkPut(updated),
					deleted && db.spaces.bulkDelete(deleted),
					message.version && upsertTableMeta('Space', message.version),
				]);
				return;
			}
			case 'synced': {
				this.lastSynced = new Date();
				this.setStatus('synced');
				return;
			}
			case 'poke': {
				this.queuePull();
				return;
			}
			case 'mutation-complete': {
				this.dispatchEvent(
					new CustomEvent(`mutation-complete-${message.mutationId}`, {
						detail: { error: message.error },
					}),
				);
				return;
			}
		}
	};

	setStatus(status: ConnectionStatus) {
		if (this.status === status) {
			return;
		}
		this.status = status;
		this.dispatchEvent(new StatusEvent(status));
	}

	onclose = (event: CloseEvent) => {
		this.setStatus('disconnected');

		// Handle authentication failures (JWT invalid/expired, or account in ERROR state)
		// Code 1008 means the server determined the session is no longer valid
		// This can happen when:
		// - JWT expires or becomes invalid
		// - Account enters ERROR state (OAuth token refresh failed)
		if (event.code === 1008 || event.reason?.includes('JWT')) {
			handleAccountError();
			return;
		}

		waitForSuccessfulPing(this.url).then(() => {
			this.connect();
		});
	};

	onerror = (error: Event) => {
		perf.error('WebSocket error:', error);
	};

	queuePull() {
		if (this.queued) {
			return;
		}
		this.queued = true;
		setTimeout(() => {
			this.queued = false;
			if (this.status === 'syncing') {
				this.queuePull();
				return;
			}
			this.pull();
		}, 1000);
	}

	async pull() {
		this.setStatus('syncing');
		const clientState = await this.getClientState();
		this.sendMessage({
			type: 'pull',
			clientState,
		});
	}

	async initialSync() {
		this.setStatus('syncing');
		const clientState = await this.getClientState();
		this.sendMessage({
			type: 'pull',
			clientState,
		});
	}

	async getClientState() {
		const db = getDatabase();
		const [previousSchema, lastUpdates] = await Promise.all([
			db.meta.get({ id: 'schema' }) as Promise<SchemaMetaSchema | undefined>,
			db.meta.where('type').equals('updatedAt').toArray() as Promise<UpdatedAtMetaSchema[]>,
		]);

		const currentSchema = getFieldSchema();
		const schemaDiff = diffSchemas(previousSchema?.data, currentSchema);
		db.meta.put({ type: 'schema', id: 'schema', data: currentSchema });

		// Create the client state
		const clientState: ClientSyncState = {};
		for (const item of lastUpdates) {
			clientState[item.data.table as keyof ClientSyncState] = {
				version: item.data.updatedAt,
				schemaChanges: schemaDiff[item.data.table] ?? { added: [], removed: [] },
			};
		}
		return clientState;
	}

	waitForOpen() {
		return new Promise<void>((resolve) => {
			if (this.status === 'disconnected' || this.status === 'loading') {
				this.addEventListener('status', () => {
					if (this.status !== 'disconnected' && this.status !== 'loading') {
						resolve();
					}
				});
				return;
			}
			resolve();
		});
	}

	isConnected() {
		const connected = this.socket.readyState === WebSocket.OPEN;
		return connected;
	}

	// Queue a message to be sent when the connection is open.
	queueMessage(message: ClientMessage) {
		this.queuedMessages.push(message);
		// Only add the open listener if this is the first message to be queued.
		if (this.queuedMessages.length === 1) {
			const openListener = () => {
				this.socket.removeEventListener('open', openListener);
				this.flushQueue();
			};
			this.socket.addEventListener('open', openListener);
		}
	}

	flushQueue() {
		while (this.queuedMessages.length > 0) {
			this.sendMessage(this.queuedMessages.shift() as ClientMessage);
		}
	}

	sendMessage(message: ClientMessage) {
		const messageId = 'id' in message && message.id ? message.id : crypto.randomUUID();
		perf.time(`[PERF] connection-sendMessage-${messageId}`);
		perf.log(`📡 [PERF] Connection.sendMessage START`, {
			messageId,
			type: message.type,
			hasId: 'id' in message && !!message.id,
		});

		if (!this.isConnected()) {
			perf.log(`📡 [PERF] Connection.sendMessage QUEUED (not connected)`, { messageId });
			this.queueMessage(message);
			return;
		}

		this.socket.send(JSON.stringify(message));
		perf.timeEnd(`[PERF] connection-sendMessage-${messageId}`);
		perf.log(`📡 [PERF] Connection.sendMessage SENT`, { messageId });
	}

	waitForMutationComplete(mutationId: string) {
		perf.time(`[PERF] connection-waitForMutation-${mutationId}`);
		perf.log(`⏳ [PERF] Connection.waitForMutationComplete START`, { mutationId });

		return new Promise<void>((resolve, reject) => {
			this.addEventListener(
				`mutation-complete-${mutationId}`,
				(event: Event) => {
					const customEvent = event as CustomEvent;
					perf.timeEnd(`[PERF] connection-waitForMutation-${mutationId}`);

					if (customEvent.detail.error) {
						perf.error(`❌ [PERF] Connection.waitForMutationComplete ERROR`, {
							mutationId,
							error: customEvent.detail.error,
						});
						reject(customEvent.detail.error);
					} else {
						perf.log(`✅ [PERF] Connection.waitForMutationComplete SUCCESS`, { mutationId });
						resolve();
					}
				},
				{ once: true },
			);
		});
	}
}

function unreachable(value: never) {
	throw new Error(`Unreachable code: ${value}`);
}

async function upsertTableMeta(table: SyncableTable, lastUpdated: string) {
	const db = getDatabase();
	let found = false;
	await db.meta.where({ id: `updatedAt-${table}` }).modify((item) => {
		found = true;
		if (item.type === 'updatedAt' && item.data.updatedAt < lastUpdated) {
			item.data.updatedAt = lastUpdated;
		}
	});
	if (!found) {
		await db.meta.put({
			id: `updatedAt-${table}`,
			type: 'updatedAt',
			data: {
				table,
				updatedAt: lastUpdated,
			},
		});
	}
}

const wsUrl = import.meta.env.PUBLIC_SYNC_ENGINE_URL;
if (!wsUrl) {
	throw new Error('PUBLIC_SYNC_ENGINE_URL is not set');
}
export const connection = new Connection(wsUrl);
