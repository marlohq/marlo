import type { InferEnum, InferSelectModel } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import * as relations from '../drizzle/relations.ts';
import * as schema from '../drizzle/schema.ts';
import { env } from './env.ts';

export * from 'drizzle-orm';
export type { PgTableWithColumns } from 'drizzle-orm/pg-core';
export { migrate } from 'drizzle-orm/postgres-js/migrator';
export * from '../drizzle/schema.ts';

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type TransactionOrDatabase = Transaction | Database;

// Inferred types for all database tables
export type Account = InferSelectModel<typeof schema.account>;
export type AppInstallation = InferSelectModel<typeof schema.appInstallation>;
export type CategoryProperty = InferSelectModel<typeof schema.categoryProperty>;
export type SpaceProperty = InferSelectModel<typeof schema.spaceProperty>;
export type ChatConversation = InferSelectModel<typeof schema.chatConversation>;
export type ChatMessage = InferSelectModel<typeof schema.chatMessage>;
export type Contact = InferSelectModel<typeof schema.contact>;
export type Draft = InferSelectModel<typeof schema.draft>;
export type Label = InferSelectModel<typeof schema.label>;
export type Message = InferSelectModel<typeof schema.message>;
export type MessageAttachment = InferSelectModel<typeof schema.messageAttachment>;
export type MessageLabel = InferSelectModel<typeof schema.messageLabel>;
export type MessageRecipient = InferSelectModel<typeof schema.messageRecipient>;
export type MCPServer = InferSelectModel<typeof schema.mcpServer>;
export type Signature = InferSelectModel<typeof schema.signature>;
export type SpaceAction = InferSelectModel<typeof schema.spaceAction>;
export type SpaceActionRun = InferSelectModel<typeof schema.spaceActionRun>;
export type Thread = InferSelectModel<typeof schema.thread>;
export type User = InferSelectModel<typeof schema.user>;
export type Space = InferSelectModel<typeof schema.space>;
export type Skill = InferSelectModel<typeof schema.skill>;
export type SkillInstallation = InferSelectModel<typeof schema.skillInstallation>;

export type MessageRecipientType = InferEnum<typeof schema.messageRecipientType>;

export type ThreadWithRelations = Thread & {
	messages: MessageWithRelations[];
};

// Type for email evaluation with message + related data
export type MessageWithRelations = Message & {
	messageRecipients: MessageRecipient[];
	messageAttachments: MessageAttachment[];
	messageLabels: (MessageLabel & { label: Label })[];
};

function getDateFieldsFromSchema(schema: AnyPgTable): string[] {
	return Object.entries(schema)
		.filter(([_, value]) => value?.dataType === 'date')
		.map(([key]) => key);
}

// List of date fields for each table, used by the sync engine to ensure dates are date objects
export const threadDateFields = getDateFieldsFromSchema(schema.thread);
export const messageDateFields = getDateFieldsFromSchema(schema.message);
export const chatConversationDateFields = getDateFieldsFromSchema(schema.chatConversation);
export const chatMessageDateFields = getDateFieldsFromSchema(schema.chatMessage);
export const contactDateFields = getDateFieldsFromSchema(schema.contact);
export const spaceDateFields = getDateFieldsFromSchema(schema.space);
export const spaceActionDateFields = getDateFieldsFromSchema(schema.spaceAction);
export const spaceActionRunDateFields = getDateFieldsFromSchema(schema.spaceActionRun);
export const userDateFields = getDateFieldsFromSchema(schema.user);
export const accountDateFields = getDateFieldsFromSchema(schema.account);
export const appInstallationDateFields = getDateFieldsFromSchema(schema.appInstallation);
export const signatureDateFields = getDateFieldsFromSchema(schema.signature);
export const labelDateFields = getDateFieldsFromSchema(schema.label);
export const mcpServerDateFields = getDateFieldsFromSchema(schema.mcpServer);
export const messageRecipientDateFields = getDateFieldsFromSchema(schema.messageRecipient);
export const messageAttachmentDateFields = getDateFieldsFromSchema(schema.messageAttachment);
export const messageLabelDateFields = getDateFieldsFromSchema(schema.messageLabel);
export const draftDateFields = getDateFieldsFromSchema(schema.draft);

// { schema } is used for relational queries
export const db = drizzle({
	connection: env.require('DATABASE_URL'),
	schema: { ...schema, ...relations },
});
