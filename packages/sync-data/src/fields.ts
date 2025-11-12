import type {
	account,
	chatConversation,
	chatMessage,
	contact,
	draft,
	label,
	message,
	messageAttachment,
	messageLabel,
	messageRecipient,
	signature,
	space,
	spaceAction,
	thread,
} from '@workspace/core/drizzle.js';

// Fields
export const accountFields = [
	'id',
	'userId',
	'name',
	'pictureHash',
	'email',
	'onboarding',
	'config',
	'createdAt',
] as const satisfies (keyof typeof account.$inferSelect)[];

export const labelFields = [
	'id',
	'name',
	'remoteId',
	'type',
] as const satisfies (keyof typeof label.$inferSelect)[];

export const signatureFields = [
	'id',
	'name',
	'content',
	'default',
] as const satisfies (keyof typeof signature.$inferSelect)[];

export const contactFields = [
	'id',
	'name',
	'email',
	'score',
	'profile',
] as const satisfies (keyof typeof contact.$inferSelect)[];

export const threadFields = [
	'id',
	'resolvedAt',
	'userId',
	'accountId',
	'remoteId',
	'trashedAt',
	'spammedAt',
	'markedSafeAt',
	'starredAt',
	'remindAt',
	'reminderTriggeredAt',
	'lastSentAt',
	'deletedAt',
	'triagedAt',
	'category',
	'spaceId',
] as const satisfies (keyof typeof thread.$inferSelect)[];
export const messageFields = [
	'id',
	'threadId',
	'userId',
	'accountId',
	'draftId',
	'remoteId',
	'sentAt',
	'senderName',
	'senderEmail',
	'readAt',
	'subject',
	'snippet',
	'contentText',
	'contentHtml',
	'inReplyTo',
	'globalId',
	'updatedAt',
	'deletedAt',
] as const satisfies (keyof typeof message.$inferSelect)[];
export const attachmentFields = [
	'id',
	'filename',
	'hash',
	'disposition',
] as const satisfies (keyof typeof messageAttachment.$inferSelect)[];

export const recipientFields = [
	'id',
	'name',
	'email',
	'type',
] as const satisfies (keyof typeof messageRecipient.$inferSelect)[];

export const messageLabelFields = [
	'id',
	'labelId',
	'messageId',
	'updatedAt',
] as const satisfies (keyof typeof messageLabel.$inferSelect)[];

export const draftFields = [
	'id',
	'messageId',
	'remoteId',
	'threadId',
	'deletedAt',
] as const satisfies (keyof typeof draft.$inferSelect)[];

export const chatMessageFields = [
	'id',
	'conversationId',
	'parts',
	'role',
	'content',
	'createdAt',
] as const satisfies (keyof typeof chatMessage.$inferSelect)[];

export const chatConversationFields = [
	'id',
	'accountId',
	'threadId',
	'createdAt',
	'updatedAt',
	'title',
] as const satisfies (keyof typeof chatConversation.$inferSelect)[];

//

export const spaceFields = [
	'id',
	'accountId',
	'name',
	'filters',
	'properties',
	'groupBy',
	'sortBy',
	'createdAt',
	'updatedAt',
] as const satisfies (keyof typeof space.$inferSelect)[];

export const spaceActionFields = [
	'id',
	'spaceId',
	'accountId',
	'triggerType',
	'prompt',
	'cronSchedule',
	'createdAt',
	'updatedAt',
] as const satisfies (keyof typeof spaceAction.$inferSelect)[];
