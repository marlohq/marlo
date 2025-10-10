import {
	boolean,
	customType,
	foreignKey,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { ContactProfile } from '../src/contacts.ts';
import type { ActionRunResult, SpaceFilter, SpaceProperties } from '../src/space.ts';
import { createId } from '../src/util.ts';

const timestamps = {
	createdAt: timestamp({ precision: 3, withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp({ precision: 3, withTimezone: true })
		.defaultNow()
		.notNull()
		.$onUpdate(() => new Date()),
};

export const accountStatus = pgEnum('AccountStatus', ['ACTIVE', 'ERROR']);
export const messageAttachmentStatus = pgEnum('MessageAttachmentStatus', [
	'PENDING',
	'UPLOADED',
	'FAILED',
	'AI_PROCESSED',
	'AI_FAILED',
	'COMPLETED',
]);
export const messageImportPriority = pgEnum('MessageImportPriority', ['LOW', 'MEDIUM', 'HIGH']);
export const messageImportStatus = pgEnum('MessageImportStatus', [
	'PENDING',
	'PROCESSING',
	'COMPLETED',
	'FAILED',
]);
export const messageRecipientType = pgEnum('MessageRecipientType', ['TO', 'CC', 'BCC']);
export const userStatus = pgEnum('UserStatus', ['INACTIVE', 'ACTIVE']);
export const mcpServerStatus = pgEnum('MCPServerStatus', [
	'INACTIVE',
	'ACTIVE',
	'ERROR',
	'CONNECTING',
]);

export const mcpServerTransport = pgEnum('MCPServerTransport', ['sse', 'http']);

export const spaceActionTriggerType = pgEnum('SpaceActionTriggerType', [
	'new_message',
	'manual',
	'cron',
]);

export const spaceActionRunStatus = pgEnum('SpaceActionRunStatus', [
	'pending',
	'running',
	'success',
	'error',
]);

// https://github.com/drizzle-team/drizzle-orm/issues/298
export const binary = customType<{
	data: Buffer;
	default: false;
}>({
	dataType() {
		return 'bytea';
	},
	fromDriver(value: unknown): Buffer {
		if (Buffer.isBuffer(value)) return value;
		if (typeof value === 'string') {
			return Buffer.from(value.slice(2), 'hex');
		}
		throw new Error('Invalid value');
	},
});

export const ulidPk = text()
	.primaryKey()
	.notNull()
	.$default(() => createId());

export const messageRecipient = pgTable(
	'MessageRecipient',
	{
		id: ulidPk,
		messageId: text().notNull(),
		email: text().notNull(),
		name: text(),
		type: messageRecipientType().notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('MessageRecipient_messageId_email_key').using(
			'btree',
			table.messageId.asc().nullsLast().op('text_ops'),
			table.email.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.messageId],
			foreignColumns: [message.id],
			name: 'MessageRecipient_messageId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const messageLabel = pgTable(
	'MessageLabel',
	{
		id: ulidPk,
		messageId: text().notNull(),
		labelId: text().notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('MessageLabel_messageId_labelId_key').using(
			'btree',
			table.messageId.asc().nullsLast().op('text_ops'),
			table.labelId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.labelId],
			foreignColumns: [label.id],
			name: 'MessageLabel_labelId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.messageId],
			foreignColumns: [message.id],
			name: 'MessageLabel_messageId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const appInstallation = pgTable(
	'AppInstallation',
	{
		id: ulidPk,
		appId: text().notNull(),
		userId: text().notNull(),
		accountId: text().notNull(),
		status: text().default('ACTIVE').notNull(),
		state: jsonb().notNull(),
		settings: jsonb(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('AppInstallation_accountId_appId_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.appId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'AppInstallation_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'AppInstallation_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const label = pgTable(
	'Label',
	{
		id: ulidPk,
		remoteId: text().notNull(),
		userId: text().notNull(),
		type: text().notNull(),
		name: text().notNull(),
		textColor: text(),
		backgroundColor: text(),
		...timestamps,
		accountId: text().notNull(),
	},
	(table) => [
		uniqueIndex('Label_accountId_remoteId_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.remoteId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Label_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Label_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const threadCategory = pgTable(
	'ThreadCategory',
	{
		id: ulidPk,
		categoryId: text().notNull(),
		threadId: text().notNull(),
		...timestamps,
		data: jsonb().default({}).notNull(),
	},
	(table) => [
		uniqueIndex('ThreadCategory_categoryId_threadId_key').using(
			'btree',
			table.categoryId.asc().nullsLast().op('text_ops'),
			table.threadId.asc().nullsLast().op('text_ops'),
		),
		index('ThreadCategory_threadId_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'ThreadCategory_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const messageAttachment = pgTable(
	'MessageAttachment',
	{
		id: ulidPk,
		messageId: text().notNull(),
		filename: text().notNull(),
		hash: text().notNull(),
		filetype: text().notNull(),
		size: integer().notNull(),
		content: text(),
		...timestamps,
		status: messageAttachmentStatus().default('PENDING').notNull(),
		contentId: text(),
		disposition: text(),
	},
	(table) => [
		index('MessageAttachment_messageId_idx').using(
			'btree',
			table.messageId.asc().nullsLast().op('text_ops'),
		),
		uniqueIndex('MessageAttachment_hash_key').using(
			'btree',
			table.hash.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.messageId],
			foreignColumns: [message.id],
			name: 'MessageAttachment_messageId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const contact = pgTable(
	'Contact',
	{
		id: ulidPk,
		userId: text().notNull(),
		score: integer().default(0).notNull(),
		scoreUpdatedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }).defaultNow(),
		email: text().notNull(),
		name: text(),
		profile: jsonb().$type<ContactProfile>(),
		profileUpdatedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		...timestamps,
		accountId: text().notNull(),
	},
	(table) => [
		index('Contact_accountId_email_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.email.asc().nullsLast().op('text_ops'),
		),
		uniqueIndex('Contact_accountId_email_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.email.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Contact_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Contact_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const chatConversation = pgTable(
	'ChatConversation',
	{
		id: ulidPk,
		threadId: text(),
		userId: text().notNull(),
		accountId: text().notNull(),
		title: text().notNull(),
		...timestamps,
	},
	(table) => [
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'ChatConversation_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'ChatConversation_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const chatMessage = pgTable(
	'ChatMessage',
	{
		id: ulidPk,
		userId: text().notNull(),
		accountId: text().notNull(),
		conversationId: text().notNull(),
		role: text().notNull(),
		content: text().notNull(),
		...timestamps,
		parts: jsonb(),
	},
	(table) => [
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'ChatMessage_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.conversationId],
			foreignColumns: [chatConversation.id],
			name: 'ChatMessage_conversationId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('restrict'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'ChatMessage_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const user = pgTable(
	'User',
	{
		id: ulidPk,
		...timestamps,
		stripeCustomerId: text().notNull(),
		status: userStatus().default('INACTIVE').notNull(),
		subscriptionData: jsonb(),
	},
	(table) => [
		uniqueIndex('User_stripeCustomerId_key').using(
			'btree',
			table.stripeCustomerId.asc().nullsLast().op('text_ops'),
		),
	],
);

export const mcpServer = pgTable(
	'MCPServer',
	{
		id: ulidPk,
		userId: text().notNull(),
		name: text().notNull(),
		serverUrlEnc: text(),
		serverUrlIv: binary('serverUrlIv'),
		serverUrlAuthTag: binary('serverUrlAuthTag'),
		status: mcpServerStatus().default('INACTIVE').notNull(),
		transport: mcpServerTransport().default('sse').notNull(),
		lastError: text(),
		appInstallationId: text().notNull(),
		...timestamps,
	},
	(table) => [
		index('MCPServer_userId_status_idx').using(
			'btree',
			table.userId.asc().nullsLast().op('text_ops'),
			table.status.asc().nullsLast().op('enum_ops'),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'MCPServer_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.appInstallationId],
			foreignColumns: [appInstallation.id],
			name: 'MCPServer_appInstallationId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const skill = pgTable(
	'Skill',
	{
		id: ulidPk,
		name: text().notNull(),
		description: text(),
		prompt: text().notNull(),
		builtins: jsonb().$type<string[]>().default([]).notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		...timestamps,
	},
	(table) => [],
);

export const skillInstallation = pgTable(
	'SkillInstallation',
	{
		id: ulidPk,
		accountId: text().notNull(),
		skillId: text().notNull(),
		appInstallationId: text(),
		deletedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		...timestamps,
	},
	(table) => [
		index('SkillInstallation_accountId_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'SkillInstallation_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.skillId],
			foreignColumns: [skill.id],
			name: 'SkillInstallation_skillId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const account = pgTable(
	'Account',
	{
		id: ulidPk,
		userId: text().notNull(),
		remoteId: text().notNull(),
		scope: text().notNull(),
		name: text().notNull(),
		email: text().notNull(),
		accessTokenEnc: text().notNull(),
		refreshTokenEnc: text(),
		accessTokenIv: binary('accessTokenIv').notNull(),
		accessTokenAuthTag: binary('accessTokenAuthTag').notNull(),
		refreshTokenIv: binary('refreshTokenIv'),
		refreshTokenAuthTag: binary('refreshTokenAuthTag'),
		tokenType: text().default('Bearer').notNull(),
		expiresAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		status: accountStatus().default('ACTIVE').notNull(),
		historyId: text(),
		...timestamps,
		watchExpiration: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		contactsSyncToken: text(),
		otherContactsSyncToken: text(),
		pictureHash: text(),
		onboarding: jsonb().default({}).notNull(),
		errorCode: text(),
		config: jsonb().default({}).notNull(),
	},
	(table) => [
		uniqueIndex('Account_email_key').using('btree', table.email.asc().nullsLast().op('text_ops')),
		uniqueIndex('Account_remoteId_key').using(
			'btree',
			table.remoteId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Account_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const draft = pgTable(
	'Draft',
	{
		id: ulidPk,
		userId: text().notNull(),
		remoteId: text().notNull(),
		messageId: text(),
		...timestamps,
		accountId: text().notNull(),
		lastSyncedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		deletedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		threadId: text(),
	},
	(table) => [
		uniqueIndex('Draft_messageId_key').using(
			'btree',
			table.messageId.asc().nullsLast().op('text_ops'),
		),
		uniqueIndex('Draft_remoteId_key').using(
			'btree',
			table.remoteId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Draft_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.messageId],
			foreignColumns: [message.id],
			name: 'Draft_messageId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Draft_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const message = pgTable(
	'Message',
	{
		id: ulidPk,
		remoteId: text().notNull(),
		userId: text().notNull(),
		threadId: text().notNull(),
		subject: text().notNull(),
		contentText: text(),
		contentHtml: text(),
		extractedContent: text(),
		senderName: text(),
		senderEmail: text().notNull(),
		readAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		draftId: text(),
		...timestamps,
		accountId: text().notNull(),
		snippet: text(),
		sentAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }).notNull(),
		inReplyTo: text(),
		globalId: text(),
		deletedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
	},
	(table) => [
		uniqueIndex('Message_accountId_remoteId_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.remoteId.asc().nullsLast().op('text_ops'),
		),
		index('Message_threadId_draftId_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.draftId.asc().nullsLast().op('text_ops'),
		),
		index('Message_threadId_sentAt_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.sentAt.asc().nullsLast().op('timestamptz_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Message_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'Message_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Message_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const signature = pgTable(
	'Signature',
	{
		id: ulidPk,
		accountId: text().notNull(),
		name: text(),
		content: text().notNull(),
		gmail: boolean().default(false).notNull(),
		default: boolean().default(false).notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('Signature_accountId_gmail_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.gmail.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Signature_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const thread = pgTable(
	'Thread',
	{
		id: ulidPk,
		remoteId: text().notNull(),
		userId: text().notNull(),
		accountId: text().notNull(),
		category: text(),
		spaceId: text(),
		resolvedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		remindAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		reminderTriggeredAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		trashedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		spammedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		markedSafeAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		...timestamps,
		lastSentAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }).notNull(),
		isImportant: boolean().default(false).notNull(),
		deletedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
		triagedAt: timestamp({ precision: 3, mode: 'date', withTimezone: true }),
	},
	(table) => [
		index('Thread_accountId_lastSentAt_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
		),
		uniqueIndex('Thread_accountId_remoteId_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.remoteId.asc().nullsLast().op('text_ops'),
		),
		index('Thread_accountId_updatedAt_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.updatedAt.asc().nullsLast().op('timestamptz_ops'),
		),
		index('Thread_lastSentAt_idx').using(
			'btree',
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
		),
		index('Thread_lastSentAt_remindAt_idx').using(
			'btree',
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
			table.remindAt.asc().nullsLast().op('timestamptz_ops'),
		),
		index('Thread_lastSentAt_resolvedAt_idx').using(
			'btree',
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
			table.resolvedAt.asc().nullsLast().op('timestamptz_ops'),
		),
		index('Thread_lastSentAt_spammedAt_idx').using(
			'btree',
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
			table.spammedAt.asc().nullsLast().op('timestamptz_ops'),
		),
		index('Thread_lastSentAt_trashedAt_idx').using(
			'btree',
			table.lastSentAt.desc().nullsFirst().op('timestamptz_ops'),
			table.trashedAt.asc().nullsLast().op('timestamptz_ops'),
		),
		index('Thread_category_idx').using('btree', table.category.asc().nullsLast().op('text_ops')),
		index('Thread_spaceId_idx').using('btree', table.spaceId.asc().nullsLast().op('text_ops')),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Thread_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: 'Thread_userId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.spaceId],
			foreignColumns: [space.id],
			name: 'Thread_spaceId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('set null'),
	],
);

export const space = pgTable(
	'Space',
	{
		id: ulidPk,
		accountId: text().notNull(),
		name: text().notNull(),
		filters: jsonb().$type<SpaceFilter>().default([]).notNull(),
		properties: jsonb().$type<SpaceProperties>().default([]).notNull(),
		groupBy: text(),
		sortBy: text(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('Space_accountId_name_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.name.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'Space_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const spaceThreadTag = pgTable(
	'SpaceThreadTag',
	{
		id: ulidPk,
		accountId: text().notNull(),
		threadId: text().notNull(),
		spaceId: text().notNull(),
		data: jsonb().default({}).notNull(),
		...timestamps,
	},
	(table) => [
		uniqueIndex('SpaceThreadTag_accountId_spaceId_threadId_key').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
			table.spaceId.asc().nullsLast().op('text_ops'),
			table.threadId.asc().nullsLast().op('text_ops'),
		),
		index('SpaceThreadTag_threadId_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'SpaceThreadTag_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'SpaceThreadTag_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.spaceId],
			foreignColumns: [space.id],
			name: 'SpaceThreadTag_spaceId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const spaceItem = pgTable(
	'SpaceItem',
	{
		id: ulidPk,
		accountId: text().notNull(),
		spaceId: text().notNull(),
		type: text().notNull(),
		data: jsonb().default({}).notNull(),
		...timestamps,
	},
	(table) => [
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'SpaceItem_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const spaceAction = pgTable(
	'SpaceAction',
	{
		id: ulidPk,
		spaceId: text().notNull(),
		accountId: text().notNull(),
		triggerType: spaceActionTriggerType().notNull(),
		prompt: text().notNull(),
		cronSchedule: text(), // UTC cron schedule (e.g., "0 13 * * 1-5")
		...timestamps,
	},
	(table) => [
		index('SpaceAction_accountId_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
		),
		index('SpaceAction_spaceId_idx').using('btree', table.spaceId.asc().nullsLast().op('text_ops')),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'SpaceAction_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.spaceId],
			foreignColumns: [space.id],
			name: 'SpaceAction_spaceId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const spaceActionRun = pgTable(
	'SpaceActionRun',
	{
		id: ulidPk,
		actionId: text().notNull(),
		threadId: text(), // null for cron triggers
		status: spaceActionRunStatus().notNull(),
		result: jsonb().$type<ActionRunResult>(), // action outputs/results
		error: text(), // error message if failed
		startedAt: timestamp({ precision: 3, withTimezone: true }).notNull(),
		completedAt: timestamp({ precision: 3, withTimezone: true }),
		...timestamps,
	},
	(table) => [
		index('SpaceActionRun_actionId_idx').using(
			'btree',
			table.actionId.asc().nullsLast().op('text_ops'),
		),
		index('SpaceActionRun_threadId_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
		),
		index('SpaceActionRun_status_idx').using(
			'btree',
			table.status.asc().nullsLast().op('enum_ops'),
		),
		foreignKey({
			columns: [table.actionId],
			foreignColumns: [spaceAction.id],
			name: 'SpaceActionRun_actionId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'SpaceActionRun_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const categoryProperty = pgTable(
	'CategoryProperty',
	{
		id: ulidPk,
		threadId: text().notNull(),
		accountId: text().notNull(),
		category: text().notNull(),
		key: text().notNull(),
		value: jsonb(),
		...timestamps,
	},
	(table) => [
		index('CategoryProperty_accountId_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
		),
		uniqueIndex('CategoryProperty_threadId_category_key_key').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.category.asc().nullsLast().op('text_ops'),
			table.key.asc().nullsLast().op('text_ops'),
		),
		index('CategoryProperty_threadId_category_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.category.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'CategoryProperty_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'CategoryProperty_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);

export const spaceProperty = pgTable(
	'SpaceProperty',
	{
		id: ulidPk,
		threadId: text().notNull(),
		accountId: text().notNull(),
		spaceId: text().notNull(),
		key: text().notNull(),
		value: jsonb(),
		...timestamps,
	},
	(table) => [
		index('SpaceProperty_accountId_idx').using(
			'btree',
			table.accountId.asc().nullsLast().op('text_ops'),
		),
		uniqueIndex('SpaceProperty_threadId_spaceId_key_key').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.spaceId.asc().nullsLast().op('text_ops'),
			table.key.asc().nullsLast().op('text_ops'),
		),
		index('SpaceProperty_threadId_spaceId_idx').using(
			'btree',
			table.threadId.asc().nullsLast().op('text_ops'),
			table.spaceId.asc().nullsLast().op('text_ops'),
		),
		foreignKey({
			columns: [table.threadId],
			foreignColumns: [thread.id],
			name: 'SpaceProperty_threadId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
		foreignKey({
			columns: [table.accountId],
			foreignColumns: [account.id],
			name: 'SpaceProperty_accountId_fkey',
		})
			.onUpdate('cascade')
			.onDelete('cascade'),
	],
);
