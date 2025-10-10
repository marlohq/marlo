import { setTimeout } from 'node:timers/promises';
import {
	account as accountTable,
	and,
	chatConversation,
	contact,
	db,
	draft,
	eq,
	gte,
	label,
	labelDateFields,
	messageAttachmentDateFields,
	messageDateFields,
	messageLabelDateFields,
	messageRecipientDateFields,
	signature,
	space,
	sql,
	type ThreadWithRelations,
	threadDateFields,
} from '@workspace/core/drizzle.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import type { AccountData, ChatConversationData, SpaceData } from '@workspace/sync-data/data.js';
import type { ClientSyncState } from '@workspace/sync-data/schema.js';
import type { ServerMessage } from '@workspace/sync-data/server-messages.js';
import {
	accountSelect,
	attachmentSelect,
	chatConversationSelect,
	chatMessageSelect,
	contactSelect,
	draftSelect,
	labelSelect,
	messageLabelSelect,
	messageSelect,
	recipientSelect,
	signatureSelect,
	spaceActionSelect,
	spaceSelect,
	threadSelect,
} from './sync-selects.js';
import { findHighest, getDateOneMillisecondsLaterIfExists, highestDate } from './util.ts';

const logger = baseLogger.child({
	namespace: 'sync-engine:sync',
});

type DeletableItem = { deletedAt: Date | null };

function splitByDeleted<T extends DeletableItem>(
	items: T[],
): {
	deleted: T[];
	updated: T[];
} {
	const deleted: T[] = [];
	const updated: T[] = [];
	for (let i = 0; i < items.length; i++) {
		const item = items[i];
		if (!item) continue;
		if (item.deletedAt) {
			deleted.push(item);
		} else {
			updated.push(item);
		}
	}
	return { deleted, updated };
}

async function queryThreadsWithData(
	accountId: string,
	options?: {
		limit?: number;
		sinceDate?: Date;
		excludeIds?: string[];
		exactDate?: Date;
		orderBy?: 'updatedAt' | 'lastSentAt';
	},
) {
	logger.debug(
		{
			limit: options?.limit,
			hasSinceDate: !!options?.sinceDate,
			hasExactDate: !!options?.exactDate,
			excludeCount: options?.excludeIds?.length,
		},
		'Querying threads with condition',
	);

	const t0 = performance.now();

	const limit = options?.limit;

	const conditions = [sql`"accountId" = ${accountId}`];

	if (options?.sinceDate) {
		logger.debug(
			{
				accountId,
				sinceDate: options.sinceDate.toISOString(),
				limit: options.limit,
			},
			'Adding WHERE updatedAt >= sinceDate filter',
		);
		conditions.push(sql`"updatedAt" >= ${options.sinceDate}`);
	}

	if (options?.exactDate) {
		conditions.push(sql`"updatedAt" = ${options.exactDate}`);
	}

	if (options?.excludeIds && options.excludeIds.length > 0) {
		conditions.push(sql`"id" NOT IN ${options.excludeIds}`);
	}

	const whereClause = conditions.length > 1 ? sql.join(conditions, sql` AND `) : conditions[0];

	const orderBy = options?.orderBy === 'lastSentAt' ? sql`"lastSentAt" DESC` : sql`"updatedAt" ASC`;

	function rawSqlSelect(
		select: { [key: string]: boolean },
		dateFields: string[],
		alias?: string,
	): string {
		const prefix = alias ? `${alias}.` : '';
		return Object.keys(select)
			.map((column) =>
				dateFields.includes(column)
					? `to_char(${prefix}"${column}" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "${column}"`
					: `${prefix}"${column}"`,
			)
			.join(', ');
	}

	function rawJsonBuildObject(
		select: { [key: string]: boolean },
		dateFields: string[],
		alias?: string,
	): string {
		const prefix = alias ? `${alias}.` : '';
		return Object.keys(select)
			.map((field) =>
				dateFields.includes(field)
					? `'${field}', to_char(${prefix}"${field}" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
					: `'${field}', ${prefix}"${field}"`,
			)
			.join(', ');
	}

	const limitClause = limit ? sql`LIMIT ${limit}` : sql``;

	const statement = sql`
WITH limited_threads AS (
  SELECT *
  FROM "Thread"
  WHERE ${whereClause}
  ORDER BY ${orderBy}, "id" ASC
  ${limitClause}
)
SELECT
	${sql.raw(rawSqlSelect(threadSelect, threadDateFields, 't'))},
	t."updatedAt",
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          ${sql.raw(rawJsonBuildObject(messageSelect, messageDateFields, 'm'))},
          'messageAttachments', COALESCE((
            SELECT json_agg(
              json_build_object(${sql.raw(rawJsonBuildObject(attachmentSelect, messageAttachmentDateFields, 'a'))})
              ORDER BY a."id" ASC
            )
            FROM "MessageAttachment" a
            WHERE a."messageId" = m.id
          ), '[]'::json),
          'messageRecipients', COALESCE((
            SELECT json_agg(
              json_build_object(
                ${sql.raw(rawJsonBuildObject(recipientSelect, messageRecipientDateFields, 'r'))}
              )
              ORDER BY r."id" ASC
            )
            FROM "MessageRecipient" r
            WHERE r."messageId" = m.id
          ), '[]'::json),
          'messageLabels', COALESCE((
            SELECT json_agg(
              json_build_object(
                ${sql.raw(rawJsonBuildObject(messageLabelSelect, messageLabelDateFields, 'ml'))},
                'label', json_build_object(
                  ${sql.raw(rawJsonBuildObject(labelSelect, labelDateFields, 'l'))}
                )
              )
              ORDER BY ml."id" ASC
            )
            FROM "MessageLabel" ml
            JOIN "Label" l ON l.id = ml."labelId"
            WHERE ml."messageId" = m.id
          ), '[]'::json)
        ) ORDER BY m."sentAt" ASC
      )
      FROM "Message" m
      WHERE m."threadId" = t.id
    ), '[]'::json
  ) AS messages,
  t."category",
  t."spaceId",
  (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', cp."id",
          'key', cp."key",
          'value', cp."value"
        )
        ORDER BY cp."id" ASC
      ), '[]'::json
    )
    FROM "CategoryProperty" cp
    WHERE cp."threadId" = t.id AND cp."category" = t."category"
  ) AS "categoryProperties",
  (
    SELECT COALESCE(
      json_agg(
        json_build_object(
          'id', sp."id",
          'key', sp."key",
          'value', sp."value"
        )
        ORDER BY sp."id" ASC
      ), '[]'::json
    )
    FROM "SpaceProperty" sp
    WHERE sp."threadId" = t.id AND sp."spaceId" = t."spaceId"
  ) AS "spaceProperties"
FROM limited_threads t
    `;

	const result: { rows: ThreadWithRelations[] } = await db.execute(statement);

	logger.debug({ count: result.rows.length, duration: performance.now() - t0 }, 'Found threads');

	return result.rows;
}

async function* syncThreads(
	accountId: string,
	clientState: ClientSyncState,
	batchSize: number,
): AsyncGenerator<ServerMessage, void, unknown> {
	let sinceThread = getDateOneMillisecondsLaterIfExists(clientState.Thread?.version);

	logger.debug(
		{
			accountId,
			clientThreadVersion: clientState.Thread?.version,
			sinceThread: sinceThread?.toISOString(),
			hasSinceThread: !!sinceThread,
		},
		'Starting syncThreads with client state',
	);

	// If the client has no threads, first send out a batch of the most recent threads.
	if (!sinceThread) {
		const t0 = performance.now();

		const threads = await queryThreadsWithData(accountId, {
			limit: batchSize,
			orderBy: 'lastSentAt', // Order by lastSentAt for initial batch so that we get the most recent threads
		});

		const { deleted, updated } = splitByDeleted(threads);

		logger.debug(
			{
				accountId,
				duration: performance.now() - t0,
				totalThreads: threads.length,
				updatedThreads: updated.length,
				deletedThreads: deleted.length,
			},
			'Found initial batch of threads to sync',
		);

		yield {
			type: 'threads',
			deleted,
			updated,
			// Do not include version here, otherwise the client will think it has the full backlog.
			// Version is sent during the full sync.
			version: undefined,
		};
	}

	while (true) {
		const t0 = performance.now();

		// Grabs threads that have been updated since the last sync.
		// The Thread, Message, and MessageLabel each have their own updatedAt field.
		// So we need this complicated query to get them correctly.
		logger.debug(
			{
				accountId,
				sinceThread: sinceThread?.toISOString(),
				batchSize,
			},
			'Querying baseThreads with sinceDate filter',
		);

		const baseThreads = await queryThreadsWithData(accountId, {
			limit: batchSize,
			sinceDate: sinceThread,
		});

		if (baseThreads.length === 0) {
			break;
		}

		logger.debug({ accountId, duration: performance.now() - t0 }, 'Found threads to sync');

		sinceThread = highestDate(sinceThread, findHighest(baseThreads));

		const remainingThreadsStart = performance.now();
		const remainingThreads = await queryThreadsWithData(accountId, {
			exactDate: sinceThread ?? new Date(0),
			excludeIds: baseThreads.map((t) => t.id),
		});

		logger.debug(
			{ accountId, duration: performance.now() - remainingThreadsStart },
			'Found remaining threads to sync',
		);

		const threads = baseThreads.concat(remainingThreads);

		const { deleted, updated } = splitByDeleted(threads);

		sinceThread = getDateOneMillisecondsLaterIfExists(
			highestDate(sinceThread, findHighest(threads)),
		);

		logger.debug(
			{
				accountId,
				duration: performance.now() - t0,
				totalThreads: threads.length,
				baseThreads: baseThreads.length,
				remainingThreads: remainingThreads.length,
				updatedThreads: updated.length,
				deletedThreads: deleted.length,
				sinceThread: sinceThread?.toISOString(),
			},
			'Found threads batch to sync (base + remaining)',
		);

		yield {
			type: 'threads',
			deleted,
			updated,
			version: sinceThread?.toISOString(),
		};

		await setTimeout(10);
	}
}

async function* syncAccounts(
	userId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceAccount = getDateOneMillisecondsLaterIfExists(clientState.Account?.version);

	const whereCondition = sinceAccount
		? and(eq(accountTable.userId, userId), gte(accountTable.updatedAt, sinceAccount))
		: eq(accountTable.userId, userId);

	const accounts = await db.query.account.findMany({
		where: whereCondition,
		orderBy: accountTable.updatedAt,
		columns: {
			...accountSelect,
			updatedAt: true,
		},
	});

	if (accounts.length === 0) {
		logger.debug({ userId, duration: performance.now() - t0 }, 'No accounts to sync');
		return;
	}

	logger.debug({ userId, duration: performance.now() - t0 }, 'Found accounts to sync');

	sinceAccount = highestDate(sinceAccount, findHighest(accounts));

	// Transform the accounts to match AccountData type expectations
	const accountsForClient: AccountData[] = accounts.map(({ updatedAt, ...account }) => ({
		...account,
		onboarding: account.onboarding as Record<string, unknown> | null,
		config: account.config as { feedLastReadAt?: string } | null,
	}));

	yield { type: 'accounts', accounts: accountsForClient, version: sinceAccount?.toISOString() };
}

async function* syncLabels(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceLabel = getDateOneMillisecondsLaterIfExists(clientState.Label?.version);

	const whereCondition = sinceLabel
		? and(eq(label.accountId, accountId), gte(label.updatedAt, sinceLabel))
		: eq(label.accountId, accountId);

	const labels = await db.query.label.findMany({
		where: whereCondition,
		orderBy: label.updatedAt,
		columns: {
			...labelSelect,
			updatedAt: true,
		},
	});

	if (labels.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No labels to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found labels to sync');

	sinceLabel = highestDate(sinceLabel, findHighest(labels));

	yield { type: 'labels', labels, version: sinceLabel?.toISOString() };
}

async function* syncSignatures(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceSignature = getDateOneMillisecondsLaterIfExists(clientState.Signature?.version);

	const whereCondition = sinceSignature
		? and(eq(signature.accountId, accountId), gte(signature.updatedAt, sinceSignature))
		: eq(signature.accountId, accountId);

	const signatures = await db.query.signature.findMany({
		where: whereCondition,
		orderBy: signature.updatedAt,
		columns: {
			...signatureSelect,
			updatedAt: true,
		},
	});

	if (signatures.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No signatures to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found signatures to sync');

	sinceSignature = highestDate(sinceSignature, findHighest(signatures));

	yield { type: 'signatures', signatures, version: sinceSignature?.toISOString() };
}

async function* syncSpaces(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceSpace = getDateOneMillisecondsLaterIfExists(clientState.Space?.version);

	const whereCondition = sinceSpace
		? and(eq(space.accountId, accountId), gte(space.updatedAt, sinceSpace))
		: eq(space.accountId, accountId);

	const spaces = await db.query.space.findMany({
		where: whereCondition,
		orderBy: space.updatedAt,
		columns: {
			...spaceSelect,
			updatedAt: true,
		},
		with: {
			actions: {
				columns: spaceActionSelect,
			},
		},
	});

	if (spaces.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No spaces to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found spaces to sync');

	sinceSpace = highestDate(sinceSpace, findHighest(spaces));

	yield {
		type: 'spaces',
		updated: spaces as SpaceData[],
		deleted: [],
		version: sinceSpace?.toISOString(),
	};
}

async function* syncContacts(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceContact = getDateOneMillisecondsLaterIfExists(clientState.Contact?.version);

	const whereCondition = sinceContact
		? and(eq(contact.accountId, accountId), gte(contact.updatedAt, sinceContact))
		: eq(contact.accountId, accountId);

	const contacts = await db.query.contact.findMany({
		where: whereCondition,
		orderBy: contact.updatedAt,
		columns: {
			...contactSelect,
			updatedAt: true,
		},
	});

	if (contacts.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No contacts to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found contacts to sync');

	sinceContact = highestDate(sinceContact, findHighest(contacts));

	yield { type: 'contacts', contacts, version: sinceContact?.toISOString() };
}

async function* syncChatConversations(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();
	let sinceChatConversation = getDateOneMillisecondsLaterIfExists(
		clientState.ChatConversation?.version,
	);

	const whereCondition = sinceChatConversation
		? and(
				eq(chatConversation.accountId, accountId),
				gte(chatConversation.updatedAt, sinceChatConversation),
			)
		: eq(chatConversation.accountId, accountId);

	const conversations = await db.query.chatConversation.findMany({
		where: whereCondition,
		orderBy: chatConversation.updatedAt,
		columns: {
			...chatConversationSelect,
			updatedAt: true,
		},
		with: {
			chatMessages: {
				columns: chatMessageSelect,
			},
		},
	});

	if (conversations.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No chat conversations to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found chat conversations to sync');

	sinceChatConversation = highestDate(sinceChatConversation, findHighest(conversations));

	yield {
		type: 'conversations',
		conversations: conversations as ChatConversationData[],
		version: sinceChatConversation?.toISOString(),
	};
}

async function* syncDrafts(
	accountId: string,
	clientState: ClientSyncState,
): AsyncGenerator<ServerMessage, void, unknown> {
	const t0 = performance.now();

	let sinceDraft = getDateOneMillisecondsLaterIfExists(clientState.Draft?.version);

	const whereCondition = sinceDraft
		? and(eq(draft.accountId, accountId), gte(draft.updatedAt, sinceDraft))
		: eq(draft.accountId, accountId);

	const drafts = await db.query.draft.findMany({
		where: whereCondition,
		columns: {
			...draftSelect,
			updatedAt: true,
			deletedAt: true,
		},
	});

	if (drafts.length === 0) {
		logger.debug({ accountId, duration: performance.now() - t0 }, 'No drafts to sync');
		return;
	}

	logger.debug({ accountId, duration: performance.now() - t0 }, 'Found drafts to sync');

	sinceDraft = highestDate(sinceDraft, findHighest(drafts));

	yield { type: 'drafts', ...splitByDeleted(drafts), version: sinceDraft?.toISOString() };
}

interface SyncOptions {
	accountId: string;
	userId: string;
	clientState: ClientSyncState;
	batchSize?: number;
}

export async function* sync({
	accountId,
	userId,
	clientState,
	batchSize = 100,
}: SyncOptions): AsyncGenerator<ServerMessage, void, unknown> {
	yield* syncAccounts(userId, clientState);
	yield* syncLabels(accountId, clientState);
	yield* syncContacts(accountId, clientState);
	const t0 = performance.now();
	yield* syncThreads(accountId, clientState, batchSize);
	logger.debug({ duration: performance.now() - t0 }, 'Sync threads completed');
	yield* syncChatConversations(accountId, clientState);
	yield* syncDrafts(accountId, clientState);
	yield* syncSignatures(accountId, clientState);
	yield* syncSpaces(accountId, clientState);
}
