import type {
	Account,
	ChatConversation,
	ChatMessage,
	Contact,
	Draft,
	Label,
	Message,
	MessageAttachment,
	MessageLabel,
	MessageRecipient,
	Signature,
	Space,
	SpaceAction,
	Thread,
} from '@workspace/core/drizzle.js';

import type {
	accountFields,
	attachmentFields,
	chatConversationFields,
	chatMessageFields,
	contactFields,
	draftFields,
	labelFields,
	messageFields,
	messageLabelFields,
	recipientFields,
	signatureFields,
	spaceActionFields,
	spaceFields,
	threadFields,
} from './fields.ts';

// Helper to create a type from an array of field names
type FieldsToType<T, Fields extends readonly (keyof T)[]> = {
	[K in Fields[number]]: T[K] extends Date
		? Date | string
		: T[K] extends Date | null
			? null | Date | string
			: T[K];
};

// Helper to expand a type to make it easier to debug.
type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

// Data used in the client
export type ThreadTableData = FieldsToType<Thread, typeof threadFields>;

export type ThreadData = Expand<
	ThreadTableData & {
		messages: MessageData[];
		categoryProperties?: CategoryThreadPropertyItem[];
		spaceProperties?: SpaceThreadPropertyItem[];
	}
>;

export type MessageTableData = FieldsToType<Message, typeof messageFields>;

export type MessageData = Expand<
	MessageTableData & {
		messageRecipients: MessageRecipientData[];
		messageAttachments: MessageAttachmentData[];
		messageLabels: MessageLabelData[];
	}
>;

export type MessageLabelTableData = Omit<
	FieldsToType<MessageLabel, typeof messageLabelFields>,
	'updatedAt'
>;

export type MessageLabelData = MessageLabelTableData & { label: LabelData };

export type MessageRecipientData = FieldsToType<MessageRecipient, typeof recipientFields>;

export type MessageAttachmentData = FieldsToType<MessageAttachment, typeof attachmentFields>;

export type LabelData = FieldsToType<Label, typeof labelFields>;

export type SignatureData = FieldsToType<Signature, typeof signatureFields>;

export type AccountData = FieldsToType<Account, typeof accountFields> & {
	onboarding: Record<string, unknown> | null;
	config: {
		feedLastReadAt?: string;
	} | null;
};

export type ContactData = FieldsToType<Contact, typeof contactFields>;

export type DraftTableData = FieldsToType<Draft, typeof draftFields>;

export type DraftData = DraftTableData;

export type ChatMessageTableData = FieldsToType<ChatMessage, typeof chatMessageFields>;

export type ChatMessageData = Expand<
	Omit<ChatMessageTableData, 'parts'> & {
		parts?: unknown[];
	}
>;

export type ChatConversationTableData = FieldsToType<
	ChatConversation,
	typeof chatConversationFields
>;

export type ChatConversationData = Expand<
	ChatConversationTableData & {
		chatMessages: ChatMessageData[];
	}
>;

//

export type SpaceActionData = FieldsToType<SpaceAction, typeof spaceActionFields>;

export type SpaceData = FieldsToType<Space, typeof spaceFields> & {
	id: string;
	actions: SpaceActionData[];
};

export type CategoryThreadPropertyItem = {
	id: string;
	key: string;
	value: unknown;
};

export type SpaceThreadPropertyItem = {
	id: string;
	key: string;
	value: unknown;
};
