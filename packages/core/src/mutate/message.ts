import { invariant } from 'es-toolkit';
import {
	db,
	eq,
	type InferInsertModel,
	message as messageTable,
	type SQL,
	type TransactionOrDatabase,
	thread as threadTable,
} from '../drizzle.js';
import { logger } from '../logger.js';

export async function updateMessage({
	tx: txOrDb = db,
	data,
	where,
}: {
	tx?: TransactionOrDatabase;
	data: Partial<InferInsertModel<typeof messageTable>>;
	where: SQL | undefined;
}) {
	const payload = {
		...data,
		readAt: data.readAt ? new Date(data.readAt) : undefined,
	};
	const updatedMessages = await txOrDb.update(messageTable).set(payload).where(where).returning();
	const updatedMessage = updatedMessages[0];
	invariant(updatedMessages.length <= 1, `Expected a unique update, got ${updatedMessages.length}`);
	invariant(updatedMessage, 'Failed to update any message');
	// Update the thread's updatedAt to the current date
	await txOrDb
		.update(threadTable)
		.set({ updatedAt: new Date() })
		.where(eq(threadTable.id, updatedMessage.threadId));
	logger.debug({ id: updatedMessage.id, updatedFields: Object.keys(payload) }, 'updateMessage()');
	return updatedMessage;
}
