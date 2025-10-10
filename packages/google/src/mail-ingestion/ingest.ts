import {
	calculateInitialScoreBonus,
	queueContactScoreUpdate,
	type ScoreEventType,
} from '@workspace/core/contact-score.js';
import {
	type Account,
	account,
	and,
	contact,
	db,
	eq,
	inArray,
	label,
	message,
	messageLabel,
	sql,
	thread,
} from '@workspace/core/drizzle.js';
import { DRAFT_LABEL_ID, INBOX_LABEL_ID, UNREAD_LABEL_ID } from '@workspace/core/labels.ts';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { parseMail, type Recipient } from '@workspace/core/mail-parser.ts';
import { MailIngestionStep, mailProcessQueue } from '@workspace/core/queues.js';
import { uploadRawMessage } from '@workspace/core/raw.js';
import { createId } from '@workspace/core/util.js';
import { invariant } from 'es-toolkit';
import type { gmail_v1 } from 'googleapis';
import sanitizeHtml from 'sanitize-html';
import { getGmailClientForAccount } from '../request-client.ts';
import type { Gmail } from '../types.ts';
import { loadGmailMessageData as extractGmailMessageData } from './batch-load.ts';
import {
	checkShouldIncludeMessageContent,
	checkShouldTagMessage,
	IGNORED_ADDRESSES,
} from './consts.ts';
import { getGmailMessage } from './gmail-calls.ts';
import { prepareConsumeMailQuery } from './mail-queries.ts';

const logger = baseLogger.child({ namespace: 'google:ingest' });

export enum MessageIngestionPriority {
	HIGH = 0,
	NORMAL = 1,
	LOW = 2,
}

export async function queueMailIngestion(
	userId: string,
	accountId: string,
	data: {
		remoteMessageId: string;
		remoteThreadId: string;
		priority: MessageIngestionPriority;
	}[],
) {
	await mailProcessQueue.addBulk(
		data.map(({ remoteMessageId, remoteThreadId, priority }) => ({
			name: 'process-mail',
			data: {
				step: MailIngestionStep.IngestMessage,
				userId,
				accountId,
				remoteMessageId,
				remoteThreadId,
			},
			opts: {
				group: {
					id: accountId,
					priority: priority === MessageIngestionPriority.HIGH ? undefined : priority,
				},
			},
		})),
	);
}

export async function consumeMessage(account: Account, remoteId: string) {
	logger.debug({ accountId: account.id, remoteId }, 'Consuming message');

	const { client: gmail } = await getGmailClientForAccount(account);
	invariant(gmail, 'Gmail tokens expired');
	const gmailMessage = await getGmailMessage(gmail, remoteId);

	invariant(gmailMessage.data.raw, 'Gmail message raw data is missing');
	invariant(gmailMessage, 'Gmail message is missing');
	invariant(gmailMessage.data.threadId, 'Gmail message threadId is missing');
	invariant(gmailMessage.data.id, 'Gmail message id is missing');
	// NOTE(fks): Avoid an invariant check on `gmailMessage.data.labelIds`.
	// The value can be null if no labels exist. This is valid and expected.

	const mailInfo = await extractMailInfo({
		message: gmailMessage.data,
		gmail,
		rawInfo: gmailMessage.data.raw,
	});

	// Skip draft messages - they're handled locally only
	if (mailInfo.remoteLabelIds.includes(DRAFT_LABEL_ID)) {
		logger.info(
			{ userId: account.userId, remoteId, accountId: account.id },
			'Skipping draft message - drafts are local-only',
		);
		return;
	}

	if (IGNORED_ADDRESSES.includes(mailInfo.fromEmail)) {
		logger.info(
			{ userId: account.userId, remoteId, from: mailInfo.fromEmail },
			'Google: ignoring message from address',
		);
		return;
	}

	await uploadRawMessage(account.id, remoteId, gmailMessage.data.raw);

	const shouldTagMessage = checkShouldTagMessage(account, mailInfo);
	const shouldSaveContent = checkShouldIncludeMessageContent(mailInfo);
	const htmlContent = shouldSaveContent ? await getMailHTML(account.id, mailInfo) : null;

	const isFromAccount = mailInfo.fromEmail === account.email;

	// Prepare queries before opening transaction
	const { sql } = prepareConsumeMailQuery(
		mailInfo,
		htmlContent,
		shouldSaveContent,
		account.userId,
		account.id,
		account.email,
	);

	// Execute both phases in a single transaction to ensure consistency
	const mail = await db.transaction(async (tx) => {
		// Insert message and thread
		const res = await tx.execute(sql);

		if (res.rows.length === 0 || !res.rows[0]) {
			throw new Error('Failed to insert mail');
		}

		const mailResult = res.rows[0] as { messageId: string; threadId: string };

		return mailResult;
	});

	return {
		messageId: mail.messageId,
		threadId: mail.threadId,
		shouldTagMessage,
		parsedMail: mailInfo.parsedMail,
		remoteMessageId: mailInfo.id,
		remoteThreadId: mailInfo.remoteThreadId,
		raw: gmailMessage.data.raw,
		remoteLabelIds: mailInfo.remoteLabelIds,
		subject: mailInfo.subject,
		internalDate: mailInfo.internalDate,
		fromEmail: mailInfo.fromEmail,
		fromName: mailInfo.fromName,
		inReplyTo: mailInfo.inReplyTo,
		accountEmail: account.email,
	};
}

async function getMailHTML(accountId: string, mailInfo: MailInfo) {
	try {
		return await mailInfo.getHTMLContent();
	} catch (error) {
		logger.error({ error, accountId, remoteId: mailInfo.id }, 'Failed to transform mail HTML');
		return null;
	}
}

export async function extractMailInfo({
	message,
	gmail,
	rawInfo,
}: {
	message: gmail_v1.Schema$Message;
	gmail: Gmail;
	rawInfo?: string;
}) {
	const safeRawInfo = rawInfo ?? message.raw;
	invariant(safeRawInfo, 'Gmail message raw data is missing');

	const mail = await parseMail(safeRawInfo);

	// Message-Id is not always present in the headers, create a random one if it's not there.
	const globalId = mail.messageId ?? createRandomMessageId();

	const cleanedGmailData = await extractGmailMessageData(message, globalId, gmail);

	// TODO: The From field can be arrays, but we're only handling the first one, as it is very rare to have multiple values.
	// However, in certain environments, this is apparently more common, so we should handle this better.
	const firstFrom = mail.from?.value[0];
	invariant(firstFrom, 'Google: message has no from field');

	const fromEmail = firstFrom.address ?? '';

	const subject = mail.subject ?? '';
	const content = mail.text ?? 'EMPTY';
	const isUnread = cleanedGmailData.remoteLabelIds.some((id) => id === UNREAD_LABEL_ID);
	const recipients: Recipient[] = [...mail.to, ...mail.cc, ...mail.bcc];
	const inReplyTo = mail.inReplyTo ?? null;

	const messageSentAt = mail.date ? mail.date : new Date();

	const htmlContent = async () => {
		if (!mail.html) {
			return null;
		}

		return await transformMailHTML(mail.html);
	};

	return {
		globalId,
		fromEmail,
		fromName: firstFrom.name,
		subject,
		content,
		isUnread,
		recipients,
		attachments: mail.attachments ?? [],
		messageSentAt,
		getHTMLContent: htmlContent,
		parsedMail: mail,
		inReplyTo,
		...cleanedGmailData,
	};
}

export type MailInfo = Awaited<ReturnType<typeof extractMailInfo>>;

export async function transformMailHTML(inputHTML: string) {
	const outputHTML = sanitizeHtml(inputHTML, {
		allowedTags: sanitizeHtml.defaults.allowedTags.concat([
			'img',
			'html',
			'body',
			'head',
			'font',
			'style',
			'table',
			'thead',
			'tbody',
			'tfoot',
			'tr',
			'td',
			'th',
			'caption',
			'colgroup',
			'col',
			'nobr',
		]),
		allowedAttributes: false,
		allowedSchemes: sanitizeHtml.defaults.allowedSchemes.concat(['cid']),
		disallowedTagsMode: 'completelyDiscard',
		parseStyleAttributes: false,
		// Note: This flag does not in fact allow any more vulnerable tags than what's specified in `allowedTags`, it just silences the warning telling us that we are allowing tags that could be vulnerable.
		allowVulnerableTags: true,
		transformTags: {
			body: 'div',
			head: 'div',
			html: 'div',
		},
	});

	return outputHTML;
}

// Interface for contact data that can come from various sources
export type ContactData = {
	email: string;
	name?: string | null;
};

export async function consumeContact({
	contactData,
	userId,
	accountId,
}: {
	contactData: ContactData;
	userId: string;
	accountId: string;
}) {
	const accountRecord = await db
		.select({ email: account.email })
		.from(account)
		.where(eq(account.id, accountId))
		.limit(1);

	invariant(accountRecord[0], 'Account not found when consuming contact');

	const contactId = createId();
	const now = new Date();

	await db
		.insert(contact)
		.values({
			id: contactId,
			userId,
			accountId,
			email: contactData.email,
			name: contactData.name,
			score: calculateInitialScoreBonus(accountRecord[0]?.email, contactData.email),
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [contact.accountId, contact.email],
			set: {
				name: contactData.name,
				score: sql`EXCLUDED."score"`,
				updatedAt: now,
			},
		});
}

interface ConsumeLabelChangesOptions {
	addedLabelIds: string[];
	removedLabelIds: string[];
	threadId: string;
	remoteMessageId: string;
	userId: string;
	accountId: string;
}

export async function consumeLabelChanges({
	remoteMessageId,
	threadId,
	userId,
	accountId,
	removedLabelIds,
	addedLabelIds,
}: ConsumeLabelChangesOptions) {
	const netAddedLabelIds = addedLabelIds.filter((id) => !removedLabelIds.includes(id));

	// If nothing is being changed after filtering, exit early
	if (removedLabelIds.length === 0 && netAddedLabelIds.length === 0) {
		return;
	}

	const results = await db.execute(sql`
        SELECT
            t.id as thread_id,
            m.id as message_id,
						m."senderEmail" as sender_email
        FROM "Thread" t
        JOIN "Message" m ON m."threadId" = t.id
        WHERE t."accountId" = ${accountId}
        AND t."remoteId" = ${threadId}
        AND m."remoteId" = ${remoteMessageId}
        LIMIT 1
    `);

	// Check if we found the thread and message
	if (!results.rows[0]) {
		logger.info(
			{ accountId, remoteThreadId: threadId, remoteMessageId },
			'Thread or message not found for label changes',
		);
		return;
	}

	const contactEvents: ScoreEventType[] = [];

	const result = results.rows[0] as { thread_id: string; message_id: string; sender_email: string };
	const existingThreadId = result.thread_id;
	const existingMessageId = result.message_id;

	// Prepare update data outside transaction
	const threadData: Partial<typeof thread.$inferInsert> = {};

	const isNowResolved = removedLabelIds.includes(INBOX_LABEL_ID);
	const isNowUnresolved = addedLabelIds.includes(INBOX_LABEL_ID);
	if (isNowResolved) {
		threadData.resolvedAt = new Date();
	} else if (isNowUnresolved) {
		threadData.resolvedAt = null;
	}

	const isNowTrash = addedLabelIds.includes('TRASH');
	const isNowNotTrash = removedLabelIds.includes('TRASH');
	if (isNowTrash) {
		threadData.trashedAt = new Date();
	} else if (isNowNotTrash) {
		threadData.trashedAt = null;
	}

	const isNowSpam = addedLabelIds.includes('SPAM');
	const isNowNotSpam = removedLabelIds.includes('SPAM');
	if (isNowSpam) {
		contactEvents.push('MARKED_AS_SPAM');
		threadData.spammedAt = new Date();
	} else if (isNowNotSpam) {
		contactEvents.push('UNMARKED_AS_SPAM');
		threadData.spammedAt = null;
	}

	const isNowRead = removedLabelIds.includes(UNREAD_LABEL_ID);
	const isNowUnread = addedLabelIds.includes(UNREAD_LABEL_ID);
	const messageData: Partial<typeof message.$inferInsert> = {};
	if (isNowRead) {
		contactEvents.push('MARKED_AS_READ');
		messageData.readAt = new Date();
	} else if (isNowUnread) {
		messageData.readAt = null;
	}

	if (contactEvents.length > 0) {
		await queueContactScoreUpdate(userId, accountId, result.sender_email, contactEvents);
	}

	// Execute all operations in a single transaction if there are any
	if (
		Object.keys(threadData).length > 0 ||
		Object.keys(messageData).length > 0 ||
		removedLabelIds.length > 0 ||
		netAddedLabelIds.length > 0
	) {
		await db.transaction(async (tx) => {
			// Add thread update if needed
			if (Object.keys(threadData).length > 0) {
				await tx.update(thread).set(threadData).where(eq(thread.id, existingThreadId));
			}

			// Add message update if needed
			if (Object.keys(messageData).length > 0) {
				await tx.update(message).set(messageData).where(eq(message.id, existingMessageId));
			}

			// Add label removal if needed
			if (removedLabelIds.length > 0) {
				// First get the label IDs to delete the message labels
				const labelsToRemove = await tx
					.select({ id: label.id })
					.from(label)
					.where(and(eq(label.userId, userId), inArray(label.remoteId, removedLabelIds)));

				if (labelsToRemove.length > 0) {
					await tx.delete(messageLabel).where(
						and(
							eq(messageLabel.messageId, existingMessageId),
							inArray(
								messageLabel.labelId,
								labelsToRemove.map((l) => l.id),
							),
						),
					);
				}
			}

			// Add label insertions if needed
			if (netAddedLabelIds.length > 0) {
				// Get the actual label IDs from the database
				const labelsToAdd = await tx
					.select({ id: label.id, remoteId: label.remoteId })
					.from(label)
					.where(and(eq(label.accountId, accountId), inArray(label.remoteId, netAddedLabelIds)));

				// Create message labels for each found label
				const messageLabelInserts = labelsToAdd.map((labelItem) => ({
					id: createId(),
					messageId: existingMessageId,
					labelId: labelItem.id,
					createdAt: new Date(),
					updatedAt: new Date(),
				}));

				if (messageLabelInserts.length > 0) {
					await tx.insert(messageLabel).values(messageLabelInserts).onConflictDoNothing();
				}
			}
		});
	}
}

function createRandomMessageId() {
	const id = createId();
	return `<missing-${id}@ingest.marlo.so>`;
}
