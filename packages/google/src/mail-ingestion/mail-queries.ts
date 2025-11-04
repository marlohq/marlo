import {
	type Message,
	type MessageAttachment,
	type MessageRecipient,
	type SQL,
	sql,
	type Thread,
} from '@workspace/core/drizzle.js';
import {
	INBOX_LABEL_ID,
	SENT_LABEL_ID,
	SPAM_LABEL_ID,
	SYSTEM_LABEL_IDS,
	TRASH_LABEL_ID,
} from '@workspace/core/labels.js';
import { getInboxSpaceId } from '@workspace/core/space.js';
import type { MailAttachement } from '@workspace/core/mail-parser.js';
import { createAttachmentHash } from '@workspace/core/storage/attachments.js';
import { createId } from '@workspace/core/util.js';
import type { MailInfo } from './ingest.ts';

function parseAttachmentDisposition(attachment: MailAttachement): string | null {
	// Parse Content-Disposition header to determine if attachment is inline
	// attachment.contentDisposition is typically "attachment" or "inline"
	if (attachment.contentDisposition) {
		return attachment.contentDisposition;
	}
	// No disposition header is present
	return null;
}

export function prepareConsumeMailQuery(
	mailInfo: MailInfo,
	htmlContent: string | null,
	shouldSaveContent: boolean,
	userId: string,
	accountId: string,
	accountEmail: string,
) {
	const {
		fromEmail,
		fromName,
		subject,
		content,
		recipients,
		messageSentAt,
		isUnread,
		attachments,
		id: remoteId,
		remoteThreadId,
		remoteLabelIds,
		inReplyTo,
		snippet,
		globalId,
	} = mailInfo;

	const sentAt = messageSentAt ? messageSentAt : new Date();

	// Determine thread status based on labels
	const isSpam = remoteLabelIds.some((id) => id === SPAM_LABEL_ID);
	const isTrash = remoteLabelIds.some((id) => id === TRASH_LABEL_ID);
	const isInbox = remoteLabelIds.some((id) => id === INBOX_LABEL_ID);
	const isSent = remoteLabelIds.some((id) => id === SENT_LABEL_ID);
	const shouldBeResolved = !isInbox || isTrash || isSpam;

	// Not an exhaustive list, but covers the most common cases. It's okay if one system label slips through.
	// We filter here because it only matters in this context to avoid JOINING on labels that are not user-defined and as such won't be in the database.
	const userLabelsRemoteIds = remoteLabelIds.filter((id) => !SYSTEM_LABEL_IDS.has(id));
	const hasLabels = userLabelsRemoteIds.length > 0;

	// Prepare data for CTEs
	const attachmentsSchema = attachments
		.filter(
			(att): att is MailAttachement & { contentId: string; filename: string } =>
				att.contentId !== undefined && att.filename !== undefined,
		)
		.map((attachment) => ({
			id: createId(),
			contentId: attachment.contentId,
			filename: attachment.filename,
			hash: createAttachmentHash(userId, remoteId, attachment.contentId),
			size: 0,
			content: null,
			// mailparser type here is wrong, contentType can be `false` when it's a malformed header (ex: `Content-Type: ; name="something"`)
			filetype: attachment.contentType ? attachment.contentType : 'application/octet-stream',
			status: 'PENDING',
			disposition: parseAttachmentDisposition(attachment),
		})) satisfies Parameters<typeof buildAttachmentsInsertCte>[0];

	const recipientsSchema = recipients.map((recipient) => ({
		id: createId(),
		name: recipient.name ?? null,
		email: recipient.address,
		type: recipient.type,
	})) satisfies Parameters<typeof buildRecipientsInsertCte>[0];

	const threadId = createId();
	const isSelfSent = (mailInfo.fromEmail || '').toLowerCase() === accountEmail.toLowerCase();
	const initialSpaceId: string | null = isSelfSent ? getInboxSpaceId(accountId) : null;

	// Build SQL using our helper function
	const sqlQuery = buildSqlQuery(
		[
			sql`vars AS (
        SELECT NOW() AS timestamp
      )`,
			buildThreadUpsertCte(
				{
					id: threadId,
					remoteId: remoteThreadId,
					userId,
					accountId,
					lastSentAt: sentAt,
					markedSafeAt: null,
				},
				isInbox,
				isTrash,
				isSpam,
				shouldBeResolved,
				isSent,
				!!inReplyTo,
				initialSpaceId,
			),
			buildMessageCte({
				id: createId(),
				accountId,
				userId,
				remoteId,
				subject,
				contentText: shouldSaveContent ? content : null,
				contentHtml: htmlContent,
				senderName: fromName ?? null,
				senderEmail: fromEmail,
				sentAt,
				snippet,
				readAt: isUnread ? null : new Date(),
				inReplyTo,
				globalId,
				extractedContent: null,
			}),
		],

		// Conditional CTEs
		// There's a performance trade-off here: if we always included the CTEs, Postgres could reuse the query plan more effectively, but
		// the SQL is shorter by removing the CTEs that are not needed, which is better depends on how the ORM makes the queries, to measure.
		[
			hasLabels ? buildLabelsInsertCte(accountId, userLabelsRemoteIds) : null,
			recipientsSchema.length > 0 ? buildRecipientsInsertCte(recipientsSchema) : null,
			attachmentsSchema.length > 0 ? buildAttachmentsInsertCte(attachmentsSchema) : null,
		],

		// Final return
		sql`SELECT message_upsert.id as "messageId", thread_upsert.id as "threadId"
		    FROM message_upsert, thread_upsert`,
	);

	return {
		sql: sqlQuery,
	};
}

function buildThreadUpsertCte(
	// Omitted fields here are filled in by the query or other parameters
	thread: Omit<
		Thread,
		| 'trashedAt'
		| 'spammedAt'
		| 'resolvedAt'
		| 'remindAt'
		| 'reminderTriggeredAt'
		| 'createdAt'
		| 'updatedAt'
		| 'triagedAt'
		| 'isImportant'
		| 'deletedAt'
		| 'category'
		| 'spaceId'
	>,
	isInbox: boolean,
	isTrash: boolean,
	isSpam: boolean,
	shouldBeResolved: boolean,
	isSent: boolean,
	isReply: boolean,
	initialSpaceId: string | null,
) {
	const { id, remoteId, userId, accountId, lastSentAt } = thread;

	const utcLastSentDate = lastSentAt.toISOString();

	const keepCurrentResolvedAt = isSent && isReply;

	return sql`thread_upsert AS (
    INSERT INTO "Thread" (
      "id", "remoteId", "userId", "accountId", "trashedAt", "spammedAt",
      "resolvedAt", "remindAt", "reminderTriggeredAt", "lastSentAt",
      "createdAt", "updatedAt", "triagedAt", "spaceId"
    )
    SELECT
      ${id}, ${remoteId}, ${userId}, ${accountId},
      ${isTrash ? sql`vars.timestamp` : sql`NULL`},
      ${isSpam ? sql`vars.timestamp` : sql`NULL`},
      ${shouldBeResolved ? sql`vars.timestamp` : sql`NULL`},
      NULL, NULL, ${utcLastSentDate}::timestamptz,
      vars.timestamp, vars.timestamp,
	  ${shouldBeResolved ? sql`vars.timestamp` : sql`NULL`},
	  ${initialSpaceId ? sql`${initialSpaceId}` : sql`NULL`}
    FROM vars
    ON CONFLICT ("accountId", "remoteId")
    DO UPDATE SET
      "trashedAt" = ${isTrash ? sql`(SELECT timestamp FROM vars)` : sql`NULL`},
      "spammedAt" = ${isSpam ? sql`(SELECT timestamp FROM vars)` : sql`NULL`},
			"resolvedAt" = ${
				// For updates (existing threads), we need to determine if we should keep the current resolvedAt.
				// If we are keeping the current resolvedAt explicitely (e.g., for sent replies), we don't want to change it.
				// Otherwise, we want to keep the thread unresolved (resolvedAt = NULL) as long as it is already unresolved,
				// even if the current message does not have the inbox label, because we do not ingest INBOX labels.
				// Only resolve the thread if it was previously resolved or if the current message explicitly resolves it.
				keepCurrentResolvedAt
					? sql`"Thread"."resolvedAt"`
					: sql`
							CASE
								WHEN "Thread"."resolvedAt" IS NULL AND NOT ${isInbox ? sql`TRUE` : sql`FALSE`}
									THEN NULL
								WHEN ${isInbox ? sql`TRUE` : sql`FALSE`}
									THEN NULL
								ELSE (SELECT timestamp FROM vars)
							END
						`
			},
      "remindAt" = NULL,
      "reminderTriggeredAt" = NULL,
      "lastSentAt" = GREATEST("Thread"."lastSentAt", ${utcLastSentDate}::timestamptz),
      "updatedAt" = (SELECT timestamp FROM vars),
	  "triagedAt" = ${shouldBeResolved ? sql`(SELECT timestamp FROM vars)` : sql`"Thread"."triagedAt"`},
	  "deletedAt" = NULL,
	  "spaceId" = ${initialSpaceId ? sql`${initialSpaceId}` : sql`"Thread"."spaceId"`}
    RETURNING "id"
  )`;
}

function buildMessageCte(
	// Omitted fields here are filled in by the query
	message: Omit<Message, 'threadId' | 'draftId' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
) {
	const {
		id,
		remoteId,
		userId,
		accountId,
		subject,
		contentText,
		contentHtml,
		senderName,
		senderEmail,
		sentAt,
		snippet,
		readAt,
		inReplyTo,
		globalId,
	} = message;

	const utcSentDate = sentAt.toISOString();
	const utcReadDate = readAt ? readAt.toISOString() : null;

	return sql`message_upsert AS (
    INSERT INTO "Message" (
      "id", "remoteId", "userId", "accountId", "threadId", "subject", "contentText",
      "contentHtml", "senderName", "senderEmail", "readAt",
      "sentAt", "snippet", "inReplyTo", "globalId", "createdAt", "updatedAt"
    )
    SELECT
      ${id}, ${remoteId}, ${userId}, ${accountId}, thread_upsert.id, ${subject},
      ${contentText}, ${contentHtml},
      ${senderName ?? senderEmail}, ${senderEmail},
      ${utcReadDate}::timestamptz,
      ${utcSentDate}::timestamptz, ${snippet}, ${inReplyTo}, ${globalId},
      vars.timestamp, vars.timestamp
    FROM thread_upsert, vars
    ON CONFLICT ("accountId", "remoteId") DO UPDATE SET
      "subject" = ${subject},
      "contentText" = ${contentText},
      "contentHtml" = ${contentHtml},
      "senderName" = ${senderName ?? senderEmail},
      "senderEmail" = ${senderEmail},
      "readAt" = ${utcReadDate}::timestamptz,
	  "globalId" = ${globalId},
	  "inReplyTo" = ${inReplyTo},
      "sentAt" = ${utcSentDate}::timestamptz,
      "snippet" = ${snippet},
      "threadId" = (SELECT id FROM thread_upsert),
      "updatedAt" = (SELECT timestamp FROM vars)
    RETURNING "id"
  )`;
}

function buildLabelsInsertCte(accountId: string, remoteLabelIds: string[]) {
	if (remoteLabelIds.length === 0) return null;

	const labelRecords = remoteLabelIds.map((labelId) => ({
		id: createId(),
		remoteLabelId: labelId,
	}));

	return sql`labels_insert AS (
		INSERT INTO "MessageLabel" ("id", "messageId", "labelId", "createdAt", "updatedAt")
		SELECT
			r.id,
			message_upsert.id,
			l."id",
			vars.timestamp,
			vars.timestamp
		FROM message_upsert, vars,
		jsonb_to_recordset(${JSON.stringify(labelRecords)}::jsonb)
			AS r(
				id text,
				remoteLabelId text
			)
		JOIN "Label" l ON l."remoteId" = r.remoteLabelId
		WHERE l."accountId" = ${accountId}
		ON CONFLICT ("messageId", "labelId") DO NOTHING
	)`;
}

function buildRecipientsInsertCte(
	recipients: Omit<MessageRecipient, 'messageId' | 'updatedAt' | 'createdAt'>[],
) {
	if (recipients.length === 0) return null;

	return sql`
		recipients_insert AS (
			INSERT INTO "MessageRecipient" (
				"id", "messageId", "email", "name", "type", "createdAt", "updatedAt"
			)
			SELECT
				r.id,
				message_upsert.id,
				r.email,
				r.name,
				r.type,
				vars.timestamp,
				vars.timestamp
			FROM message_upsert, vars,
			jsonb_to_recordset(${JSON.stringify(recipients)}::jsonb)
				AS r(
					id text,
					email text,
					name text,
					type "MessageRecipientType"
				)
			ON CONFLICT ("messageId", "email") DO NOTHING
		)
	`;
}

function buildAttachmentsInsertCte(
	attachments: Omit<MessageAttachment, 'messageId' | 'createdAt' | 'updatedAt'>[],
) {
	if (attachments.length === 0) return null;

	return sql`
		attachments_insert AS (
			INSERT INTO "MessageAttachment" (
				"id", "filename", "filetype", "size", "hash", "messageId", "content", "createdAt", "updatedAt", "contentId"
			)
			SELECT
				a.id,
				a.filename,
				a.filetype,
				a.size,
				a.hash,
				message_upsert.id,
				a.content,
				vars.timestamp,
				vars.timestamp,
				a.contentId
			FROM message_upsert, vars,
			jsonb_to_recordset(${JSON.stringify(attachments)}::jsonb)
				AS a(
					id text,
					filename text,
					filetype text,
					size integer,
					hash text,
					content text,
					contentId text
				)
			ON CONFLICT ("hash") DO NOTHING
		)
	`;
}

/** Builds a SQL query with CTEs, automatically handling commas between components */
function buildSqlQuery(baseCTEs: SQL[], conditionalCTEs: (SQL | null)[], finalQuery: SQL): SQL {
	// Filter out null/undefined/false values
	const validConditionalCTEs = conditionalCTEs.filter(Boolean) as SQL[];

	if (validConditionalCTEs.length > 0) {
		// Combine everything with proper formatting
		return sql`
    WITH ${sql.join(
			baseCTEs,
			sql`,

`,
		)}
    ,

${sql.join(
	validConditionalCTEs,
	sql`,

`,
)}

    ${finalQuery}
  `;
	} else {
		return sql`
    WITH ${sql.join(
			baseCTEs,
			sql`,

`,
		)}

    ${finalQuery}
  `;
	}
}
