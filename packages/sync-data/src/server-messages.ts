import type {
	AccountData,
	ChatConversationData,
	ContactData,
	DraftData,
	LabelData,
	SignatureData,
	SpaceData,
	ThreadData,
} from './data.ts';

// Sync messages
export interface ThreadMessage {
	type: 'threads';
	updated: ThreadData[];
	deleted: ThreadData[];
	version: string | undefined;
}

export interface DraftMessage {
	type: 'drafts';
	updated: DraftData[];
	deleted: DraftData[];
	version: string | undefined;
}

export interface AccountMessage {
	type: 'accounts';
	accounts: AccountData[];
	version: string | undefined;
}

export interface LabelMessage {
	type: 'labels';
	labels: LabelData[];
	version: string | undefined;
}

export interface SignatureMessage {
	type: 'signatures';
	signatures: SignatureData[];
	version: string | undefined;
}

export interface ContactMessage {
	type: 'contacts';
	contacts: ContactData[];
	version: string | undefined;
}

export interface ChatConversationMessage {
	type: 'conversations';
	conversations: ChatConversationData[];
	version: string | undefined;
}

export interface SpaceMessage {
	type: 'spaces';
	updated: SpaceData[];
	deleted: SpaceData[];
	version: string | undefined;
}

export interface SyncedMessage {
	type: 'synced';
}

export interface PokeMessage {
	type: 'poke';
}

// Deprecated
export interface MutationCompleteMessage {
	type: 'mutation-complete';
	mutationId: string;
	error?: string;
}

export type ServerMessage =
	| ThreadMessage
	| AccountMessage
	| LabelMessage
	| SignatureMessage
	| ContactMessage
	| ChatConversationMessage
	| DraftMessage
	| SpaceMessage
	| SyncedMessage
	| PokeMessage
	| MutationCompleteMessage;
