import type {
	AccountData,
	ChatConversationData,
	ContactData,
	DraftData,
	LabelData,
	MessageData,
	MessageLabelTableData,
	MessageTableData,
	SignatureData,
	SpaceActionData,
	SpaceData,
	ThreadData,
} from './data.ts';
import type { ClientSyncState } from './schema.ts';

export interface PullMessage {
	type: 'pull';
	clientState: ClientSyncState;
}

type RequiredUpdateProps<T extends { id: string }> =
	// MessageLabel is mutated based on the labelId
	T extends MessageLabelTableData
		? Pick<T, 'labelId'> & { threadId: string }
		: // Message requires the threadId
			T extends MessageTableData
			? Pick<T, 'threadId' | 'id'>
			: // SpaceAction requires the spaceId
				T extends SpaceActionData
				? Pick<T, 'spaceId' | 'id'>
				: // Everything else just requires the id
					Pick<T, 'id'>;

type MutationMessage<T extends { id: string }, TableName> = {
	id: string;
	type: 'mutation';
	table: TableName;
} & (
	| {
			action: 'create';
			data: T;
	  }
	| {
			action: 'update';
			data: Partial<T> & RequiredUpdateProps<T>;
			options: { replace: boolean };
	  }
	| {
			action: 'delete';
			data: T extends MessageLabelTableData
				? Pick<T, 'id' | 'messageId'> & { threadId: string }
				: Pick<T, 'id'>;
	  }
	| {
			action: 'upsert';
			data: T;
	  }
);

type BatchMutationMessage<T extends { id: string }, TableName, IDS> = {
	type: 'batch';
	id: string;
	action: 'update';
	table: TableName;
	updates: Array<{ key: string; changes: Partial<T> }>;
};

export type AccountMutationMessage = MutationMessage<AccountData, 'Account'>;
export type MessageMutationMessage = MutationMessage<MessageData, 'Message'>;
export type ThreadMutationMessage = MutationMessage<ThreadData, 'Thread'>;
export type LabelMutationMessage = MutationMessage<LabelData, 'Label'>;
export type ChatConversationMutationMessage = MutationMessage<
	ChatConversationData,
	'ChatConversation'
>;
export type DraftMutationMessage = MutationMessage<DraftData, 'Draft'>;
export type SpaceMutationMessage = MutationMessage<SpaceData, 'Space'>;
export type SpaceActionMutationMessage = MutationMessage<SpaceActionData, 'SpaceAction'>;

// All mutation messages
export type MutationMessages =
	| AccountMutationMessage
	| MessageMutationMessage
	| ThreadMutationMessage
	| LabelMutationMessage
	| ChatConversationMutationMessage
	| DraftMutationMessage
	| SpaceActionMutationMessage
	| SpaceMutationMessage;

export type MessageBatchMessages = BatchMutationMessage<
	MessageData,
	'Message',
	{ id: string; threadId: string }[]
>;
export type AccountBatchMessages = BatchMutationMessage<AccountData, 'Account', string[]>;
export type BatchThreadMessages = BatchMutationMessage<ThreadData, 'Thread', string[]>;
export type BatchLabelMessages = BatchMutationMessage<LabelData, 'Label', string[]>;
export type BatchChatConversationMessages = BatchMutationMessage<
	ChatConversationData,
	'ChatConversation',
	string[]
>;
export type BatchDraftMessages = BatchMutationMessage<DraftData, 'Draft', string[]>;
export type BatchContactMessages = BatchMutationMessage<ContactData, 'Contact', string[]>;
export type BatchSignatureMessages = BatchMutationMessage<SignatureData, 'Signature', string[]>;
export type BatchSpaceMessages = BatchMutationMessage<SpaceData, 'Space', string[]>;
export type BatchSpaceActionMessages = BatchMutationMessage<
	SpaceActionData,
	'SpaceAction',
	string[]
>;

export type BatchMessages =
	| BatchThreadMessages
	| MessageBatchMessages
	| AccountBatchMessages
	| BatchLabelMessages
	| BatchChatConversationMessages
	| BatchDraftMessages
	| BatchContactMessages
	| BatchSignatureMessages
	| BatchSpaceActionMessages
	| BatchSpaceMessages;

export type ClientMessage = MutationMessages | PullMessage | BatchMessages;
