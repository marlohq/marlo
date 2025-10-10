import {
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
} from '@workspace/sync-data/fields.js';

// Create column selects for Drizzle relational queries - using boolean true for columns
const createColumnsSelect = <T extends readonly string[]>(fields: T) => {
	const result = {} as { [K in T[number]]: true };
	for (const field of fields) {
		(result as Record<string, true>)[field] = true;
	}
	return result;
};

// Select columns for Drizzle
export const accountSelect = createColumnsSelect(accountFields);
export const labelSelect = createColumnsSelect(labelFields);
export const signatureSelect = createColumnsSelect(signatureFields);
export const contactSelect = createColumnsSelect(contactFields);
export const draftSelect = createColumnsSelect(draftFields);
export const spaceSelect = createColumnsSelect(spaceFields);

// For chat conversations and messages
export const chatConversationSelect = createColumnsSelect(chatConversationFields);
export const chatMessageSelect = createColumnsSelect(chatMessageFields);

// For messages and related tables
export const messageSelect = createColumnsSelect(messageFields);
export const attachmentSelect = createColumnsSelect(attachmentFields);
export const recipientSelect = createColumnsSelect(recipientFields);
export const messageLabelSelect = createColumnsSelect(messageLabelFields);

// For threads and related tables
export const threadSelect = createColumnsSelect(threadFields);
export const spaceActionSelect = createColumnsSelect(spaceActionFields);
