import { createId } from '@workspace/core/util.js';
import { getDatabase } from '@workspace/local/database.js';
import { mutate } from '@workspace/local/mutate.js';
import type {
	AccountData,
	DraftData,
	MessageData,
	MessageRecipientData,
	ThreadData,
} from '@workspace/sync-data/data.js';
import { invariant } from 'es-toolkit';

function formatGmailTimestamp(date: Date): string {
	const gmailDateFormatter = new Intl.DateTimeFormat('en-US', {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		hour12: true,
	});

	const formatted = gmailDateFormatter.format(date);
	// Convert "Tue, Aug 12, 2025, 3:46 PM" to "Tue, Aug 12, 2025 at 3:46 PM"
	return formatted.replace(/, (\d+:\d+ [AP]M)$/, ' at $1');
}

interface NewDraftDataRecipient {
	addr: string;
	name: string | null;
}

export interface NewDraftData {
	subject: string;
	attachments: File[];
	body: string;
	cc: NewDraftDataRecipient[];
	bcc: NewDraftDataRecipient[];
	to: NewDraftDataRecipient[];
}

export function blankMessage(
	account: AccountData,
	partial: Partial<MessageData> & Pick<MessageData, 'threadId' | 'draftId'>,
): MessageData {
	const id = createId();
	const now = new Date().toISOString();
	return {
		id,
		userId: account.userId,
		accountId: account.id,
		remoteId: `ZZ${id}`,
		snippet: '',
		subject: '',
		contentText: '',
		contentHtml: '',
		senderName: account.name,
		senderEmail: account.email,
		messageRecipients: [],
		readAt: null,
		sentAt: now,
		messageAttachments: [],
		inReplyTo: partial.inReplyTo ?? null,
		globalId: `ZZ${id}`,
		messageLabels: [],
		updatedAt: now,
		deletedAt: null,
		...partial,
	};
}

export function blankDraft(draftId: string, threadId: string, messageId: string): DraftData {
	return {
		id: draftId,
		messageId,
		remoteId: `ZZ${draftId}`,
		threadId,
		deletedAt: null,
	};
}

export function createReplyQuoteHtml(parentMessage: MessageData) {
	return `<br><br><div class="gmail_quote"><div class="gmail_attr">On ${formatGmailTimestamp(new Date(parentMessage.sentAt))} ${parentMessage.senderName} &lt;${parentMessage.senderEmail}&gt; wrote:</div><blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${parentMessage.contentHtml}</blockquote></div>`;
}

export function createForwardQuoteHtml(parentMessage: MessageData) {
	const formattedTo = (parentMessage.messageRecipients ?? [])
		.filter((r) => r.type === 'TO')
		.map((r) => `${r.name ? `${r.name} ` : ''}&lt;${r.email}&gt;`)
		.join(', ');
	const formattedCc = (parentMessage.messageRecipients ?? [])
		.filter((r) => r.type === 'CC')
		.map((r) => `${r.name ? `${r.name} ` : ''}&lt;${r.email}&gt;`)
		.join(', ');

	const toLine = formattedTo ? `To: ${formattedTo}` : '';
	const ccLine = formattedCc ? `<br>Cc: ${formattedCc}` : '';

	return `<br><br><div class="gmail_quote gmail_quote_container"><div class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">${parentMessage.senderName}</strong> <span dir="auto">&lt;<a href="mailto:${parentMessage.senderEmail}">${parentMessage.senderEmail}</a>&gt;</span><br>Date: ${formatGmailTimestamp(new Date(parentMessage.sentAt))}<br>Subject: ${parentMessage.subject}<br>${toLine}${ccLine}</div><br>${parentMessage.contentHtml}`;
}

export async function createDraftWithIds(
	account: AccountData,
	draftId: string,
	messageId: string,
	threadId: string,
	data: NewDraftData,
) {
	const messageRemoteId = `ZZ${messageId}`;
	const messageGlobalId = `ZZ${messageId}`;
	const now = new Date().toISOString();

	const message: MessageData = {
		...blankMessage(account, { draftId, threadId }),
		id: messageId,
		remoteId: messageRemoteId,
		globalId: messageGlobalId,
		subject: data.subject,
		contentHtml: data.body,
		contentText: data.body,
		messageRecipients: createRecipients(data),
		inReplyTo: null,
		updatedAt: now,
	};

	const thread: ThreadData = {
		id: threadId,
		remoteId: `ZZ${threadId}`,
		userId: account.userId,
		accountId: account.id,
		category: null,
		spaceId: `inbox_${account.id}`,
		resolvedAt: null,
		remindAt: null,
		reminderTriggeredAt: null,
		trashedAt: null,
		spammedAt: null,
		markedSafeAt: null,
		lastSentAt: now,
		deletedAt: null,
		triagedAt: null,
		messages: [message],
	};

	// Creates the thread and message.
	await mutate.threads.create(thread);

	// Creates the draft.
	const draft: DraftData = {
		id: draftId,
		messageId,
		threadId,
		remoteId: `ZZ${draftId}`,
		deletedAt: null,
	};
	await mutate.drafts.create(draft);
}

export async function createDraft({
	account,
	data,
	parentThreadId,
	inReplyTo,
}: {
	account: AccountData;
	data: NewDraftData;
	parentThreadId?: string;
	inReplyTo?: string | null;
}): Promise<{ draft: DraftData; draftMessage: MessageData }> {
	const draftId = createId();
	const messageId = createId();
	const messageRemoteId = `ZZ${messageId}`;
	const messageGlobalId = `ZZ${messageId}`;
	const now = new Date().toISOString();

	if (parentThreadId) {
		const message: MessageData = {
			...blankMessage(account, { draftId, threadId: parentThreadId }),
			id: messageId,
			remoteId: messageRemoteId,
			globalId: messageGlobalId,
			subject: data.subject,
			contentHtml: data.body,
			contentText: data.body,
			messageRecipients: createRecipients(data),
			inReplyTo: inReplyTo ?? null,
			updatedAt: now,
		};

		await mutate.messages.create(parentThreadId, message);

		// Creates the draft.
		const draft: DraftData = {
			id: draftId,
			messageId,
			threadId: parentThreadId,
			remoteId: `ZZ${draftId}`,
			deletedAt: null,
		};
		await mutate.drafts.create(draft);

		return { draft, draftMessage: message };
	} else {
		const threadId = createId();

		const message: MessageData = {
			...blankMessage(account, { draftId, threadId }),
			id: messageId,
			remoteId: messageRemoteId,
			globalId: messageGlobalId,
			subject: data.subject,
			contentHtml: data.body,
			contentText: data.body,
			messageRecipients: createRecipients(data),
			inReplyTo: inReplyTo ?? null,
			updatedAt: now,
		};

		const thread: ThreadData = {
			id: threadId,
			remoteId: `ZZ${threadId}`,
			userId: account.userId,
			accountId: account.id,
			category: null,
			spaceId: null,
			resolvedAt: null,
			remindAt: null,
			reminderTriggeredAt: null,
			trashedAt: null,
			spammedAt: null,
			markedSafeAt: null,
			lastSentAt: now,
			deletedAt: null,
			triagedAt: null,
			messages: [message],
		};

		// Creates the thread and message.
		await mutate.threads.create(thread);

		// Creates the draft.
		const draft: DraftData = {
			id: draftId,
			messageId,
			threadId,
			remoteId: `ZZ${draftId}`,
			deletedAt: null,
		};
		await mutate.drafts.create(draft);

		return { draft, draftMessage: message };
	}
}

export async function saveDraft(
	threadId: string,
	draftMessageId: string,
	account: AccountData,
	data: NewDraftData,
) {
	const now = new Date().toISOString();

	const db = getDatabase();
	const threadSchema = await db.threads.get({ 'data.id': threadId });
	invariant(threadSchema, 'Thread not found');
	const thread = threadSchema.data;

	const draftMessage = thread.messages.find((m) => m.id === draftMessageId);
	invariant(draftMessage, 'Draft message not found');
	invariant(draftMessage.draftId, 'Draft message has no draft id');

	// Update the existing message instead of creating a new one
	const updatedRecipients = updateRecipientsForDraft(draftMessage.messageRecipients, data);

	await mutate.messages.update(threadId, draftMessageId, {
		subject: data.subject,
		contentHtml: data.body,
		contentText: data.body,
		messageRecipients: updatedRecipients,
		updatedAt: now,
	});
}

export async function getDeleteDraftPromises(threadId: string, draftMessageId: string) {
	const db = getDatabase();

	// Delete the draft.
	const deletedAt = new Date().toISOString();

	const threadSchema = await db.threads.get({ 'data.id': threadId });
	invariant(threadSchema, 'Thread not found');
	const thread = threadSchema.data;

	const draftMessage = thread.messages.find((m) => m.id === draftMessageId);
	invariant(draftMessage, 'Draft message not found');
	const draftId = draftMessage.draftId;
	invariant(draftId, 'Draft message has no draft id');

	// Possibly delete the thread if it has no other messages.
	const nonDeletedMessages = thread.messages.filter(
		(m) => m.id !== draftMessage.id && !m.deletedAt,
	).length;

	// Separate local and remote into separate promises so we can navigate sooner
	const threadLocalDelete =
		nonDeletedMessages === 0
			? mutate.threads.modify(getDatabase(), thread.id, {
					deletedAt,
				})
			: Promise.resolve(undefined);

	const threadRemoteDelete = threadLocalDelete.then((data) =>
		mutate.threads.syncUpdateToRemote(data),
	);

	const messageDelete = mutate.messages.update(threadId, draftMessage.id, {
		deletedAt,
	});

	const draftDelete = mutate.drafts.update(draftId, {
		deletedAt,
	});

	return {
		threadLocal: threadLocalDelete,
		thread: threadRemoteDelete,
		message: messageDelete,
		draft: draftDelete,
	};
}

export async function deleteDraft(threadId: string, draftMessageId: string) {
	const { thread, message, draft } = await getDeleteDraftPromises(threadId, draftMessageId);
	const deletions = Promise.all([thread, message, draft]);
	return await deletions;
}

function createRecipients(data: NewDraftData) {
	const recipients = [
		...data.cc.map((r) => ({
			id: createId(),
			email: r.addr,
			name: r.name,
			type: 'CC' as const,
		})),
		...data.bcc.map((r) => ({
			id: createId(),
			email: r.addr,
			name: r.name,
			type: 'BCC' as const,
		})),
		...data.to.map((r) => ({
			id: createId(),
			email: r.addr,
			name: r.name,
			type: 'TO' as const,
		})),
	];
	return recipients;
}

function updateRecipientsForDraft(existingRecipients: MessageRecipientData[], data: NewDraftData) {
	// Create a map of new recipients by email+type for easy lookup
	const newRecipientMap = new Map<string, { email: string; type: string; name: string | null }>();

	// Add all new recipients to the map
	[
		...data.to.map((r) => ({ email: r.addr, type: 'TO' as const, name: r.name })),
		...data.cc.map((r) => ({ email: r.addr, type: 'CC' as const, name: r.name })),
		...data.bcc.map((r) => ({ email: r.addr, type: 'BCC' as const, name: r.name })),
	].forEach(({ email, type, name }) => {
		const key = `${email}:${type}`;
		newRecipientMap.set(key, { email, type, name });
	});

	// Start with existing recipients, updating them if they exist in new data
	const updatedRecipients = existingRecipients
		.map((existing) => {
			const key = `${existing.email}:${existing.type}`;
			// Remove from new map since we're keeping this existing one
			// But remember to update the name, in case it changed.
			const newRecipient = newRecipientMap.get(key);
			if (newRecipient) {
				newRecipientMap.delete(key);
				return { ...existing, name: newRecipient.name };
			}
			// This recipient was removed, mark for deletion
			return null;
		})
		.filter(Boolean) as MessageRecipientData[];

	// Add any remaining new recipients
	newRecipientMap.forEach(({ email, type, name }) => {
		updatedRecipients.push({
			id: createId(),
			email,
			name: name ?? null,
			type: type as 'TO' | 'CC' | 'BCC',
		});
	});

	return updatedRecipients;
}
