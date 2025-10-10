import {
	accountDateFields,
	account as accountTable,
	and,
	chatConversationDateFields,
	chatConversation as chatConversationTable,
	chatMessageDateFields,
	chatMessage as chatMessageTable,
	db,
	draftDateFields,
	draft as draftTable,
	eq,
	exists,
	inArray,
	label as labelTable,
	messageDateFields,
	messageLabel as messageLabelTable,
	messageRecipient as messageRecipientTable,
	message as messageTable,
	not,
	spaceActionDateFields,
	spaceAction as spaceActionTable,
	spaceDateFields,
	space as spaceTable,
	threadDateFields,
	thread as threadTable,
} from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { updateMessage } from '@workspace/core/mutate/message.js';
import type {
	AccountMutationMessage,
	BatchSpaceActionMessages,
	BatchThreadMessages,
	ChatConversationMutationMessage,
	DraftMutationMessage,
	LabelMutationMessage,
	MessageBatchMessages,
	MessageMutationMessage,
	SpaceActionMutationMessage,
	SpaceMutationMessage,
	ThreadMutationMessage,
} from '@workspace/sync-data/client-messages.js';

const logger = baseLogger.child({
	namespace: 'sync-engine:mutate',
});

// Utility function to convert string dates to Date objects
function ensureDateFields<T extends Record<string, unknown>>(
	data: T,
	dateFields: string[],
): T & {
	[K in keyof T]: K extends string ? (K extends (typeof dateFields)[number] ? Date : T[K]) : T[K];
} {
	const result = { ...data } as Record<string, unknown>;
	for (const field of dateFields) {
		if (result[field] && typeof result[field] === 'string') {
			result[field] = new Date(result[field]);
		}
	}
	return result as T & {
		[K in keyof T]: K extends string ? (K extends (typeof dateFields)[number] ? Date : T[K]) : T[K];
	};
}

export async function mutateAccount(accountId: string, account: AccountMutationMessage) {
	switch (account.action) {
		case 'update': {
			const { userId, id, ...rest } = account.data;
			const dataWithDates = ensureDateFields(rest, accountDateFields);

			await db
				.update(accountTable)
				.set({
					...dataWithDates,
					onboarding: dataWithDates.onboarding ?? {},
					config: dataWithDates.config ?? {},
				})
				.where(eq(accountTable.id, accountId));
			return;
		}
		default: {
			logger.error(
				{ accountId, table: account.table, action: account.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateMessage(
	accountId: string,
	userId: string,
	message: MessageMutationMessage,
) {
	switch (message.action) {
		case 'create': {
			await db.transaction(async (tx) => {
				// Create the message first
				const messageData = message.data;
				const messageDataWithDates = ensureDateFields(messageData, messageDateFields);

				const [createdMessage] = await tx
					.insert(messageTable)
					.values({
						...messageDataWithDates,
						userId,
						accountId,
					})
					.returning();

				if (!createdMessage) {
					throw new Error('Failed to create message');
				}

				// Create attachments if any
				if (messageData.messageAttachments?.length > 0) {
					// TODO: Handle attachments - create separate insertions
					// await tx.insert(messageAttachmentTable).values(...)
				}

				// Create labels if any
				if (messageData.messageLabels?.length > 0) {
					await tx.insert(messageLabelTable).values(
						messageData.messageLabels.map((label) => ({
							...label,
							messageId: createdMessage.id,
						})),
					);
				}

				// Create recipients if any
				if (messageData.messageRecipients?.length > 0) {
					await tx.insert(messageRecipientTable).values(
						messageData.messageRecipients.map((recipient) => ({
							...recipient,
							messageId: createdMessage.id,
						})),
					);
				}

				logger.info({ userId, accountId, messageId: createdMessage.id }, 'Message created');
			});
			return;
		}
		case 'update': {
			// TODO: Handle attachments
			const { threadId, messageAttachments, messageLabels, messageRecipients, ...rest } =
				message.data;
			const restWithDates = ensureDateFields(rest, messageDateFields);

			await db.transaction(async (tx) => {
				// Update the message
				await updateMessage({
					tx,
					data: restWithDates,
					where: and(eq(messageTable.id, message.data.id), eq(messageTable.accountId, accountId)),
				});
				// Handle labels update separately
				if (messageLabels) {
					const newLabelIds = messageLabels.map((label) => label.labelId);

					// Delete labels that are no longer present
					// When newLabelIds is empty, not(inArray()) will match all rows for this message
					await tx.delete(messageLabelTable).where(
						and(
							eq(messageLabelTable.messageId, message.data.id),
							not(inArray(messageLabelTable.labelId, newLabelIds)),
							exists(
								tx
									.select()
									.from(messageTable)
									.where(
										and(
											eq(messageTable.id, message.data.id),
											eq(messageTable.accountId, accountId),
										),
									),
							),
						),
					);

					// Insert or update the new labels
					for (const label of messageLabels) {
						await tx
							.insert(messageLabelTable)
							.values({
								id: label.id,
								messageId: message.data.id,
								labelId: label.labelId,
							})
							.onConflictDoNothing();
					}
				}

				// Handle recipients update separately
				if (messageRecipients) {
					for (const recipient of messageRecipients) {
						await tx
							.insert(messageRecipientTable)
							.values({
								id: recipient.id,
								messageId: message.data.id,
								email: recipient.email,
								name: recipient.name,
								type: recipient.type,
							})
							.onConflictDoUpdate({
								target: [messageRecipientTable.id],
								set: {
									email: recipient.email,
									name: recipient.name,
								},
							});
					}
				}
			});

			logger.info(
				{
					userId,
					accountId,
					messageId: message.data.id,
					messageRemoteId: message.data.remoteId,
				},
				'Message updated',
			);
			return;
		}
		case 'delete': {
			await db
				.delete(messageTable)
				.where(
					and(
						eq(messageTable.id, message.data.id),
						eq(messageTable.accountId, accountId),
						eq(messageTable.userId, userId),
					),
				);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: message.table, action: message.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateMessages(
	accountId: string,
	userId: string,
	message: MessageBatchMessages,
) {
	switch (message.action) {
		case 'update': {
			const messageIds: string[] = [];
			const threadIds = new Set<string>();

			await db.transaction(async (tx) => {
				// Collect all message IDs and update promises
				const updatePromises = message.updates.map(async (update) => {
					const dataWithDates = ensureDateFields(update.changes, messageDateFields);

					messageIds.push(update.key);

					// Update the individual message
					return tx
						.update(messageTable)
						.set(dataWithDates)
						.where(
							and(
								eq(messageTable.id, update.key),
								eq(messageTable.accountId, accountId),
								eq(messageTable.userId, userId),
							),
						);
				});

				// Execute all message updates in parallel
				await Promise.all(updatePromises);

				// Now get all thread IDs in a single query
				if (messageIds.length > 0) {
					const messageRecords = await tx
						.select({ threadId: messageTable.threadId })
						.from(messageTable)
						.where(inArray(messageTable.id, messageIds));

					for (const record of messageRecords) {
						threadIds.add(record.threadId);
					}
				}

				// Update threads
				if (threadIds.size > 0) {
					await tx
						.update(threadTable)
						.set({ updatedAt: new Date() })
						.where(
							and(
								inArray(threadTable.id, Array.from(threadIds)),
								eq(threadTable.accountId, accountId),
								eq(threadTable.userId, userId),
							),
						);
				}
			});

			logger.info(
				{ userId, accountId, messageIds, threadIds: Array.from(threadIds) },
				'Batch messages updated',
			);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: message.table, action: message.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateLabel(accountId: string, userId: string, label: LabelMutationMessage) {
	switch (label.action) {
		case 'create': {
			await db.insert(labelTable).values({
				...label.data,
				userId,
				accountId,
			});
			return;
		}
		default: {
			logger.error(
				{ accountId, table: label.table, action: label.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateThread(
	accountId: string,
	userId: string,
	message: ThreadMutationMessage,
) {
	switch (message.action) {
		case 'create': {
			await db.transaction(async (tx) => {
				const { messages, ...rest } = message.data;
				const threadDataWithDates = ensureDateFields(rest, threadDateFields);

				const [thread] = await tx
					.insert(threadTable)
					.values({
						...threadDataWithDates,
						userId,
						accountId,
					})
					.returning();

				if (!thread) {
					throw new Error('Failed to create thread');
				}

				for (const newMessage of message.data.messages) {
					const { messageRecipients, messageLabels, messageAttachments, ...messageRest } =
						newMessage;
					const messageDataWithDates = ensureDateFields(messageRest, messageDateFields);

					// Create message
					const [createdMessage] = await tx
						.insert(messageTable)
						.values({
							...messageDataWithDates,
							userId,
							accountId,
							threadId: thread.id,
						})
						.returning();

					if (!createdMessage) {
						throw new Error('Failed to create message');
					}

					// Create recipients
					if (messageRecipients?.length > 0) {
						await tx.insert(messageRecipientTable).values(
							messageRecipients.map((recipient) => ({
								...recipient,
								messageId: createdMessage.id,
							})),
						);
					}

					// Create labels
					if (messageLabels?.length > 0) {
						await tx.insert(messageLabelTable).values(
							messageLabels.map((label) => ({
								...label,
								messageId: createdMessage.id,
							})),
						);
					}
				}
			});
			return;
		}
		case 'update': {
			const { messages, ...updateData } = message.data;
			const updateDataWithDates = ensureDateFields(updateData, threadDateFields);

			await db
				.update(threadTable)
				.set(updateDataWithDates)
				.where(and(eq(threadTable.id, message.data.id), eq(threadTable.accountId, accountId)));

			// Handle message updates separately if needed
			if (messages && messages.length > 0) {
				for (const messageUpdate of messages) {
					const messageDataWithDates = ensureDateFields(messageUpdate, messageDateFields);

					await db
						.update(messageTable)
						.set(messageDataWithDates)
						.where(eq(messageTable.id, messageUpdate.id));
				}
			}
			return;
		}
		case 'delete': {
			await db.transaction(async (tx) => {
				// Soft delete messages by updating their deletedAt
				await tx
					.update(messageTable)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(messageTable.threadId, message.data.id), eq(messageTable.accountId, accountId)),
					);

				// Soft delete thread
				await tx
					.update(threadTable)
					.set({ deletedAt: new Date() })
					.where(and(eq(threadTable.id, message.data.id), eq(threadTable.accountId, accountId)));
			});
			return;
		}
		default: {
			logger.error(
				{ accountId, table: message.table, action: message.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateThreads(
	accountId: string,
	userId: string,
	message: BatchThreadMessages,
) {
	switch (message.action) {
		case 'update': {
			await db.transaction(async (tx) => {
				// Collect all update promises to execute them in parallel
				const updatePromises = message.updates.map(async (update) => {
					const flatChanges = update.changes as Record<string, unknown>;

					// Update flat thread fields if any
					if (Object.keys(flatChanges).length > 0) {
						const dataWithDates = ensureDateFields(flatChanges, threadDateFields);
						return tx
							.update(threadTable)
							.set(dataWithDates)
							.where(
								and(
									eq(threadTable.id, update.key),
									eq(threadTable.accountId, accountId),
									eq(threadTable.userId, userId),
								),
							);
					}
				});

				// Execute all updates in parallel
				await Promise.all(updatePromises.filter(Boolean));
			});
			return;
		}
		default: {
			logger.error(
				{ accountId, table: message.table, action: message.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateChatConversation(
	accountId: string,
	userId: string,
	conversation: ChatConversationMutationMessage,
) {
	switch (conversation.action) {
		case 'create': {
			await db.transaction(async (tx) => {
				const { chatMessages, ...conversationData } = conversation.data;
				const conversationDataWithDates = ensureDateFields(
					conversationData,
					chatConversationDateFields,
				);

				// Create the chat conversation first
				const [createdConversation] = await tx
					.insert(chatConversationTable)
					.values({
						...conversationDataWithDates,
						accountId,
						userId,
					})
					.returning();

				if (!createdConversation) {
					throw new Error('Failed to create chat conversation');
				}

				// Create messages
				if (chatMessages && chatMessages.length > 0) {
					const messageDateFields = ['createdAt'];
					const messagesWithDates = chatMessages.map((message) =>
						ensureDateFields(message, messageDateFields),
					);

					await tx.insert(chatMessageTable).values(
						messagesWithDates.map((message) => ({
							...message,
							conversationId: createdConversation.id,
							userId,
							accountId,
							parts: message.parts,
						})),
					);
				}
			});
			return;
		}
		case 'update': {
			const { chatMessages, ...rest } = conversation.data;
			const restWithDates = ensureDateFields(rest, chatConversationDateFields);

			await db.transaction(async (tx) => {
				// Update the conversation
				await tx
					.update(chatConversationTable)
					.set(restWithDates)
					.where(
						and(
							eq(chatConversationTable.id, conversation.data.id),
							eq(chatConversationTable.accountId, accountId),
							eq(chatConversationTable.userId, userId),
						),
					);

				// Handle message updates/creates
				if (chatMessages && chatMessages.length > 0) {
					for (const message of chatMessages) {
						const messageWithDates = ensureDateFields(message, chatMessageDateFields);

						await tx
							.insert(chatMessageTable)
							.values({
								...messageWithDates,
								conversationId: conversation.data.id,
								userId,
								accountId,
								parts: messageWithDates.parts,
							})
							.onConflictDoUpdate({
								target: [chatMessageTable.id],
								set: {
									...messageWithDates,
									parts: messageWithDates.parts,
								},
							});
					}
				}
			});
			return;
		}
		default: {
			logger.error(
				{ accountId, table: conversation.table, action: conversation.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateDraft(
	accountId: string,
	userId: string,
	draftMessage: DraftMutationMessage,
) {
	switch (draftMessage.action) {
		case 'create': {
			try {
				const dataWithDates = ensureDateFields(draftMessage.data, draftDateFields);

				await db.insert(draftTable).values({
					...dataWithDates,
					userId,
					accountId,
				});
			} catch (error) {
				logger.error(
					{
						accountId,
						userId,
						draftId: draftMessage.data.id,
						messageId: draftMessage.data.messageId,
					},
					error?.toString?.() ?? 'Unknown error',
				);
				throw error;
			}
			return;
		}
		case 'update': {
			try {
				const dataWithDates = ensureDateFields(draftMessage.data, draftDateFields);

				await db
					.update(draftTable)
					.set(dataWithDates)
					.where(
						and(
							eq(draftTable.id, draftMessage.data.id),
							eq(draftTable.userId, userId),
							eq(draftTable.accountId, accountId),
						),
					);
				logger.info(
					{
						userId,
						accountId,
						draftId: draftMessage.data.id,
					},
					'Draft updated',
				);
			} catch (error) {
				logger.error(
					{
						accountId,
						userId,
						draftId: draftMessage.data.id,
						messageId: draftMessage.data.messageId,
					},
					error?.toString?.() ?? 'Unknown error',
				);
				throw error;
			}
			return;
		}
		case 'delete': {
			await db
				.delete(draftTable)
				.where(
					and(
						eq(draftTable.id, draftMessage.data.id),
						eq(draftTable.userId, userId),
						eq(draftTable.accountId, accountId),
					),
				);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: draftMessage.table, action: draftMessage.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateSpace(accountId: string, userId: string, space: SpaceMutationMessage) {
	switch (space.action) {
		case 'create': {
			const { accountId: _, ...createData } = space.data;
			const dataWithDates = ensureDateFields(createData, spaceDateFields);

			await db.insert(spaceTable).values({
				...dataWithDates,
				accountId,
			});
			logger.info(
				{
					userId,
					accountId,
					spaceId: space.data.id,
				},
				'Space created',
			);
			return;
		}
		case 'update': {
			const { id, accountId: _, ...updateData } = space.data;
			const dataWithDates = ensureDateFields(updateData, spaceDateFields);
			await db
				.update(spaceTable)
				.set(dataWithDates)
				.where(and(eq(spaceTable.id, space.data.id), eq(spaceTable.accountId, accountId)));
			logger.info(
				{
					userId,
					accountId,
					spaceId: space.data.id,
				},
				'Space updated',
			);
			return;
		}
		case 'delete': {
			await db
				.delete(spaceTable)
				.where(and(eq(spaceTable.id, space.data.id), eq(spaceTable.accountId, accountId)));
			logger.info(
				{
					userId,
					accountId,
					spaceId: space.data.id,
				},
				'Space deleted',
			);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: space.table, action: space.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateSpaceAction(
	accountId: string,
	userId: string,
	spaceAction: SpaceActionMutationMessage,
) {
	switch (spaceAction.action) {
		case 'create': {
			const dataWithDates = ensureDateFields(spaceAction.data, spaceActionDateFields);

			await db.insert(spaceActionTable).values({
				...dataWithDates,
				accountId,
			});
			logger.info(
				{
					userId,
					accountId,
					spaceActionId: spaceAction.data.id,
					spaceId: spaceAction.data.spaceId,
				},
				'SpaceAction created',
			);
			return;
		}
		case 'update': {
			const { id, spaceId, ...updateData } = spaceAction.data;
			const dataWithDates = ensureDateFields(updateData, spaceActionDateFields);

			await db
				.update(spaceActionTable)
				.set(dataWithDates)
				.where(
					and(
						eq(spaceActionTable.id, spaceAction.data.id),
						eq(spaceActionTable.accountId, accountId),
					),
				);
			logger.info(
				{
					userId,
					accountId,
					spaceActionId: spaceAction.data.id,
					spaceId: spaceAction.data.spaceId,
				},
				'SpaceAction updated',
			);
			return;
		}
		case 'delete': {
			await db
				.delete(spaceActionTable)
				.where(
					and(
						eq(spaceActionTable.id, spaceAction.data.id),
						eq(spaceActionTable.accountId, accountId),
					),
				);
			logger.info(
				{
					userId,
					accountId,
					spaceActionId: spaceAction.data.id,
				},
				'SpaceAction deleted',
			);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: spaceAction.table, action: spaceAction.action },
				'Unknown message action',
			);
			return;
		}
	}
}

export async function mutateSpaceActions(
	accountId: string,
	userId: string,
	message: BatchSpaceActionMessages,
) {
	switch (message.action) {
		case 'update': {
			await db.transaction(async (tx) => {
				// Collect all update promises to execute them in parallel
				const updatePromises = message.updates.map(async (update) => {
					const dataWithDates = ensureDateFields(update.changes, spaceActionDateFields);

					return tx
						.update(spaceActionTable)
						.set(dataWithDates)
						.where(
							and(eq(spaceActionTable.id, update.key), eq(spaceActionTable.accountId, accountId)),
						);
				});

				// Execute all updates in parallel
				await Promise.all(updatePromises);
			});

			logger.info(
				{ userId, accountId, actionCount: message.updates.length },
				'Batch space actions updated',
			);
			return;
		}
		default: {
			logger.error(
				{ accountId, table: message.table, action: message.action },
				'Unknown space action batch action',
			);
			return;
		}
	}
}
