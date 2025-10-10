import { relations } from 'drizzle-orm/relations';
import {
	account,
	appInstallation,
	categoryProperty,
	chatConversation,
	chatMessage,
	contact,
	draft,
	label,
	mcpServer,
	message,
	messageAttachment,
	messageLabel,
	messageRecipient,
	signature,
	skill,
	skillInstallation,
	space,
	spaceAction,
	spaceActionRun,
	spaceProperty,
	thread,
	user,
} from './schema.ts';

export const messageRecipientRelations = relations(messageRecipient, ({ one }) => ({
	message: one(message, {
		fields: [messageRecipient.messageId],
		references: [message.id],
	}),
}));

export const messageRelations = relations(message, ({ one, many }) => ({
	messageRecipients: many(messageRecipient),
	messageLabels: many(messageLabel),
	messageAttachments: many(messageAttachment),
	drafts: many(draft),
	account: one(account, {
		fields: [message.accountId],
		references: [account.id],
	}),
	thread: one(thread, {
		fields: [message.threadId],
		references: [thread.id],
	}),
	user: one(user, {
		fields: [message.userId],
		references: [user.id],
	}),
}));

export const messageLabelRelations = relations(messageLabel, ({ one }) => ({
	label: one(label, {
		fields: [messageLabel.labelId],
		references: [label.id],
	}),
	message: one(message, {
		fields: [messageLabel.messageId],
		references: [message.id],
	}),
}));

export const labelRelations = relations(label, ({ one, many }) => ({
	messageLabels: many(messageLabel),
	account: one(account, {
		fields: [label.accountId],
		references: [account.id],
	}),
	user: one(user, {
		fields: [label.userId],
		references: [user.id],
	}),
}));

export const appInstallationRelations = relations(appInstallation, ({ one, many }) => ({
	account: one(account, {
		fields: [appInstallation.accountId],
		references: [account.id],
	}),
	user: one(user, {
		fields: [appInstallation.userId],
		references: [user.id],
	}),
	mcpServers: many(mcpServer),
}));

export const accountRelations = relations(account, ({ one, many }) => ({
	appInstallations: many(appInstallation),
	labels: many(label),
	contacts: many(contact),
	chatConversations: many(chatConversation),
	chatMessages: many(chatMessage),
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
	drafts: many(draft),
	messages: many(message),
	signatures: many(signature),
	threads: many(thread),
	spaceActions: many(spaceAction),
	skillInstallations: many(skillInstallation),
}));

export const userRelations = relations(user, ({ many }) => ({
	appInstallations: many(appInstallation),
	labels: many(label),
	contacts: many(contact),
	chatConversations: many(chatConversation),
	chatMessages: many(chatMessage),
	accounts: many(account),
	drafts: many(draft),
	messages: many(message),
	threads: many(thread),
	mcpServers: many(mcpServer),
}));

export const threadRelations = relations(thread, ({ one, many }) => ({
	messages: many(message),
	categoryProperties: many(categoryProperty),
	spaceProperties: many(spaceProperty),
	account: one(account, {
		fields: [thread.accountId],
		references: [account.id],
	}),
	user: one(user, {
		fields: [thread.userId],
		references: [user.id],
	}),
}));

export const messageAttachmentRelations = relations(messageAttachment, ({ one }) => ({
	message: one(message, {
		fields: [messageAttachment.messageId],
		references: [message.id],
	}),
}));

export const contactRelations = relations(contact, ({ one }) => ({
	account: one(account, {
		fields: [contact.accountId],
		references: [account.id],
	}),
	user: one(user, {
		fields: [contact.userId],
		references: [user.id],
	}),
}));

export const chatConversationRelations = relations(chatConversation, ({ one, many }) => ({
	account: one(account, {
		fields: [chatConversation.accountId],
		references: [account.id],
	}),
	user: one(user, {
		fields: [chatConversation.userId],
		references: [user.id],
	}),
	chatMessages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ one }) => ({
	account: one(account, {
		fields: [chatMessage.accountId],
		references: [account.id],
	}),
	chatConversation: one(chatConversation, {
		fields: [chatMessage.conversationId],
		references: [chatConversation.id],
	}),
	user: one(user, {
		fields: [chatMessage.userId],
		references: [user.id],
	}),
}));

export const draftRelations = relations(draft, ({ one }) => ({
	account: one(account, {
		fields: [draft.accountId],
		references: [account.id],
	}),
	message: one(message, {
		fields: [draft.messageId],
		references: [message.id],
	}),
	user: one(user, {
		fields: [draft.userId],
		references: [user.id],
	}),
}));

export const signatureRelations = relations(signature, ({ one }) => ({
	account: one(account, {
		fields: [signature.accountId],
		references: [account.id],
	}),
}));

export const spaceRelations = relations(space, ({ one, many }) => ({
	account: one(account, {
		fields: [space.accountId],
		references: [account.id],
	}),
	actions: many(spaceAction),
}));

export const mcpServerRelations = relations(mcpServer, ({ one }) => ({
	user: one(user, {
		fields: [mcpServer.userId],
		references: [user.id],
	}),
	appInstallation: one(appInstallation, {
		fields: [mcpServer.appInstallationId],
		references: [appInstallation.id],
	}),
}));

export const spaceActionRelations = relations(spaceAction, ({ one, many }) => ({
	account: one(account, {
		fields: [spaceAction.accountId],
		references: [account.id],
	}),
	space: one(space, {
		fields: [spaceAction.spaceId],
		references: [space.id],
	}),
	runs: many(spaceActionRun),
}));

export const spaceActionRunRelations = relations(spaceActionRun, ({ one }) => ({
	action: one(spaceAction, {
		fields: [spaceActionRun.actionId],
		references: [spaceAction.id],
	}),
	thread: one(thread, {
		fields: [spaceActionRun.threadId],
		references: [thread.id],
	}),
}));

export const skillRelations = relations(skill, ({ many }) => ({
	skillInstallations: many(skillInstallation),
}));

export const skillInstallationRelations = relations(skillInstallation, ({ one }) => ({
	account: one(account, {
		fields: [skillInstallation.accountId],
		references: [account.id],
	}),
	skill: one(skill, {
		fields: [skillInstallation.skillId],
		references: [skill.id],
	}),
	appInstallation: one(appInstallation, {
		fields: [skillInstallation.appInstallationId],
		references: [appInstallation.id],
	}),
}));
