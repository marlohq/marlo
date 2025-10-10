import type {
	AccountData,
	ChatConversationData,
	ContactData,
	DraftData,
	LabelData,
	MessageData,
	SignatureData,
	SpaceData,
	ThreadData,
} from '@workspace/sync-data/data.ts';
import {
	accountFields,
	attachmentFields,
	contactFields,
	draftFields,
	labelFields,
	messageFields,
	messageLabelFields,
	recipientFields,
	signatureFields,
	spaceFields,
	threadFields,
} from '@workspace/sync-data/fields.ts';
import type { SchemaDifferences, SyncableTable } from '@workspace/sync-data/schema.ts';
import { diff } from 'deep-diff';
import type { Table } from './database.ts';
import type { ThreadView } from './thread/view.ts';

export type { ThreadData, AccountData, MessageData };

// Object store schema
export interface SchemaMetaSchema {
	id: string;
	type: 'schema';
	data: ReturnType<typeof getFieldSchema>;
}

export interface UpdatedAtMetaSchema {
	id: string;
	type: 'updatedAt';
	data: {
		table: SyncableTable;
		updatedAt: string;
	};
}

export type MetaSchema = UpdatedAtMetaSchema | SchemaMetaSchema;

export interface ThreadSchema {
	view: ThreadView;
	hasDraft: 1 | false;
	data: ThreadData;
}

export interface AccountSchema {
	data: AccountData;
}

export interface LabelSchema {
	data: LabelData;
}

export interface SignatureSchema {
	data: SignatureData;
}

export interface ContactSchema {
	data: ContactData;
}

export interface DraftSchema {
	data: DraftData;
}

export interface ChatConversationSchema {
	data: ChatConversationData;
}

export interface SpaceSchema {
	data: SpaceData;
}

// Table definition
export type MetaTable = Table<MetaSchema, 'id'>;
export type ThreadTable = Table<ThreadSchema, 'data.id'>;
export type AccountTable = Table<AccountSchema, 'data.id'>;
export type LabelTable = Table<LabelSchema, 'data.id'>;
export type SignatureTable = Table<SignatureSchema, 'data.id'>;
export type ContactTable = Table<ContactSchema, 'data.id'>;
export type DraftTable = Table<DraftSchema, 'data.id'>;
export type ChatConversationTable = Table<ChatConversationSchema, 'data.id'>;
export type SpaceTable = Table<SpaceSchema, 'data.id'>;

export function getFieldSchema() {
	return {
		Thread: threadFields,
		Message: messageFields,
		MessageLabel: messageLabelFields,
		Account: accountFields,
		Contact: contactFields,
		Recipient: recipientFields,
		Draft: draftFields,
		Label: labelFields,
		Signature: signatureFields,
		Attachment: attachmentFields,
		Space: spaceFields,
	};
}

export function diffSchemas(
	previousSchema: Record<string, string[]> | undefined,
	currentSchema: Record<string, string[]>,
): SchemaDifferences {
	if (!previousSchema) {
		// If no previous schema, treat all current tables as added
		return Object.keys(currentSchema).reduce((acc, table) => {
			acc[table] = {
				added: currentSchema[table] ?? [],
				removed: [],
			};
			return acc;
		}, {} as SchemaDifferences);
	}

	const differences = diff(previousSchema, currentSchema);
	if (!differences) return {};

	const result: SchemaDifferences = {};

	differences.forEach((diff) => {
		if (!diff.path) return;

		const table = diff.path[0] as string;
		if (!result[table]) {
			result[table] = {
				added: [],
				removed: [],
			};
		}

		if (diff.kind === 'A') {
			if (diff.item.kind === 'N') {
				const value = diff.item.rhs as unknown as string;
				result[table].added.push(value);
			} else if (diff.item.kind === 'D') {
				const value = diff.item.lhs as unknown as string;
				result[table].removed.push(value);
			}
		}
	});

	return result;
}
