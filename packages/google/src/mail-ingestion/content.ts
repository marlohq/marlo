import { type Account, and, db, eq, message as messageTable } from '@workspace/core/drizzle.js';
import { logger } from '@workspace/core/logger.js';
import { parseMailDecoded } from '@workspace/core/mail-parser.js';
import { updateMessage } from '@workspace/core/mutate/message.js';
import { rawToString } from '@workspace/core/raw.js';
import { getMessage } from '@workspace/core/storage/raw.js';
import { invariant } from 'es-toolkit';
import { transformMailHTML } from './ingest.ts';

export async function fetchMessageContent(account: Account, remoteId: string) {
	logger.info({ accountId: account.id, remoteMessageId: remoteId }, 'Fetching message content');

	const messageStream = await getMessage(account.id, remoteId);
	invariant(messageStream, 'Message raw data not found');

	const content = await rawToString(messageStream);
	const parsedMail = await parseMailDecoded(content);
	const contentHtml = parsedMail.html ? await transformMailHTML(parsedMail.html) : '';
	const contentText = parsedMail.text ?? 'EMPTY';

	await db.transaction(async (tx) => {
		const foundMessages = await tx
			.select({
				threadId: messageTable.threadId,
				id: messageTable.id,
			})
			.from(messageTable)
			.where(and(eq(messageTable.accountId, account.id), eq(messageTable.remoteId, remoteId)))
			.limit(1);

		if (foundMessages[0]) {
			await updateMessage({
				tx,
				data: { contentHtml, contentText },
				// Safe to use "id" without "accountId" here because we already filtered above.
				where: eq(messageTable.id, foundMessages[0].id),
			});
		}
	});

	return {
		contentHtml,
		contentText,
	};
}
