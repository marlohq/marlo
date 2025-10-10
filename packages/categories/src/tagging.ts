import { categorizeMessage, generateMailReport } from '@workspace/ai';
import { queueContactScoreUpdate } from '@workspace/core/contact-score.js';
import {
	and,
	categoryProperty,
	contact,
	db,
	eq,
	type Message,
	message,
	sql,
	thread,
} from '@workspace/core/drizzle.js';
import { UnrecoverableError } from '@workspace/core/errors.js';
import { captureException } from '@workspace/core/instrument.js';
import { logger as baseLogger } from '@workspace/core/logger.js';
import { type Mail, parseMailDecoded } from '@workspace/core/mail-parser.js';
import { rawToString } from '@workspace/core/raw.js';
import { getMessage } from '@workspace/core/storage/raw.js';
import type { MailReport } from '@workspace/core/types.js';
import { invariant } from 'es-toolkit';
import { APICallError, isRateLimitError } from '../../ai/src/errors.js';
import type { CategoryId, CategoryServerModule, InputJsonObject } from './types.js';
import { getCategoryServerModule } from './util.js';

const logger = baseLogger.child({ namespace: 'category:tagging' });

async function checkMessageTag(
	taggingData: Parameters<NonNullable<NonNullable<CategoryServerModule['tagging']>['check']>>[0],
): Promise<CategoryId | null> {
	const allCategories = await import('./util.js').then((m) => m.getAllCategoryServerModules());
	for (const [categoryId, category] of Object.entries(allCategories)) {
		if (category?.tagging?.check) {
			const precheckResult = await category.tagging.check(taggingData);
			if (precheckResult === true) {
				return category.id as CategoryId;
			}
		}
	}
	return null;
}

async function analyzeMessageTag(message: Message, report: MailReport): Promise<CategoryId | null> {
	const contactScore = await db.query.contact
		.findFirst({
			where: and(eq(contact.email, message.senderEmail), eq(contact.accountId, message.accountId)),
		})
		.then((c) => c?.score ?? 0);

	const lowerSubject = message.subject?.toLowerCase().trim();
	if (lowerSubject?.startsWith('re:')) return null;
	if (lowerSubject?.startsWith('fwd:')) return null;
	const { category } = await categorizeMessage({
		messageId: message.id,
		contactScore,
		report,
	});
	switch (category) {
		case 'NONE':
			return null;
		case 'CONVERSATION':
			return null;
		case 'JUNK':
			return 'junk';
		case 'PROMOTION':
			return 'promotions';
		case 'NEWSLETTER':
			return 'newsletters';
		case 'ORDER':
			return 'receipts';
		case 'PARCEL_DELIVERY':
			return 'delivery';
		case 'INVOICE':
			return 'invoice';
		case 'RESERVATION':
			return 'reservation';
		case 'AUTHENTICATION':
			return 'authentication';
		// Not yet handled:
		case 'NOTIFICATION':
			return 'updates';
		default: {
			// Use a TypeScript exhaustive check to ensure all cases are handled
			// If a new category is added to the type, TypeScript will error here until it's handled above.
			const _exhaustiveCheck: never = category;
			return null;
		}
	}
}

export async function tagMessage(messageId: string, report: MailReport, mail?: Mail) {
	const t0 = performance.now();

	const messageResult = await db.query.message.findFirst({
		where: eq(message.id, messageId),
		with: {
			thread: true,
		},
	});

	if (!messageResult) {
		throw new Error(`Message with id ${messageId} not found`);
	}

	let parsedMail: Mail | undefined = mail;
	if (!parsedMail) {
		const messageStream = await getMessage(messageResult.accountId, messageResult.remoteId);
		invariant(messageStream, 'Message raw data not found');

		const content = await rawToString(messageStream);
		parsedMail = await parseMailDecoded(content);
	}

	const taggingData = {
		message: messageResult,
		thread: messageResult.thread,
		report,
		mail: parsedMail,
	};

	// Check if any category wants to tag the message.
	// First, use the category-specific check function.
	// If that doesn't return a result, use the AI to analyze the message.
	// If that doesn't return a result, the message is not tagged.
	let categoryId: CategoryId | null = null;
	categoryId = categoryId ?? (await checkMessageTag(taggingData));
	categoryId = categoryId ?? (await analyzeMessageTag(messageResult, report));

	// If no category claims the message, then we consider it automatically passing
	// the triage step and proceeding to the inbox.
	if (categoryId === null) {
		await queueContactScoreUpdate(
			messageResult.userId,
			messageResult.accountId,
			messageResult.senderEmail,
			['LANDED_IN_PRIORITY'] as const,
		);
		await addThreadToInbox(messageResult);
		return;
	}

	const category = await getCategoryServerModule(categoryId);
	if (!category) {
		await queueContactScoreUpdate(
			messageResult.userId,
			messageResult.accountId,
			messageResult.senderEmail,
			['LANDED_IN_PRIORITY'] as const,
		);
		await addThreadToInbox(messageResult);
		captureException(
			{
				categoryId,
				messageId,
			},
			'Category server module not found for categoryId',
		);
		return;
	}

	// If the category has a tag function, call it. This is how the category
	// can populate the threadCategory `data` column with additional data.
	// `data` will be saved to the DB, overwriting any existing data.
	// NOTE: We can implement a merge if we want to add to the existing data, instead of overwriting it.
	let tagData: InputJsonObject = {};
	if (category.tagging?.tag) {
		tagData = await category.tagging.tag(taggingData);
	}
	// Category-specific tagging functions can return a `priority` key, which will
	// cause the thread to be added to the priority inbox.
	if (tagData.priority) {
		await queueContactScoreUpdate(
			messageResult.userId,
			messageResult.accountId,
			messageResult.senderEmail,
			['LANDED_IN_PRIORITY'] as const,
		);
		await addThreadToInbox(messageResult);
	}

	await db
		.update(thread)
		.set({ category: categoryId, updatedAt: new Date() })
		.where(eq(thread.id, messageResult.threadId));

	const updatedCategoryPropertyValues = Object.entries(tagData).map(([key, value]) => ({
		threadId: messageResult.threadId,
		accountId: messageResult.accountId,
		category: categoryId,
		key,
		value,
	}));

	if (updatedCategoryPropertyValues.length > 0) {
		await db
			.insert(categoryProperty)
			.values(updatedCategoryPropertyValues)
			.onConflictDoUpdate({
				target: [categoryProperty.threadId, categoryProperty.category, categoryProperty.key],
				set: { value: sql`excluded.value` },
			});
	}

	// Tell the rest of Marlo that the thread has been updated.
	// This is needed for things like the sync engine to pick up the change.
	await db
		.update(thread)
		.set({ updatedAt: new Date() })
		.where(eq(thread.id, messageResult.threadId));

	logger.debug({ messageId, duration: performance.now() - t0 }, 'Message tagged');
}

async function addThreadToInbox(message: Message) {
	logger.debug({ messageId: message.id, threadId: message.threadId }, 'Pinning thread to inbox');

	await db
		.update(thread)
		.set({ spaceId: `inbox_${message.accountId}`, updatedAt: new Date() })
		.where(eq(thread.id, message.threadId));

	await db.update(thread).set({ updatedAt: new Date() }).where(eq(thread.id, message.threadId));
}

/**
 * Generates a mail report for the given message
 *
 * @param accountId - The account ID
 * @param messageId - The message ID
 * @param preparsedMail - The optional pre-parsed mail object
 * @returns The generated mail report or rate limit error information
 */
export async function generateMailReportForMessage(
	accountId: string,
	messageId: string,
	preparsedMail?: Mail,
): Promise<{ report: MailReport } | { status: 'rate-limited'; error: unknown }> {
	let parsedMail: Mail | undefined = preparsedMail;
	if (!parsedMail) {
		// If we don't have the parsed data, get it from the raw and parse it

		const messageStream = await getMessage(accountId, messageId);
		invariant(messageStream, 'Message raw data not found');

		const content = await rawToString(messageStream);
		parsedMail = await parseMailDecoded(content);
	}

	try {
		const report = await generateMailReport({
			messageId,
			mail: parsedMail,
		});

		// Save the cleaned content to the database
		await db
			.update(message)
			.set({
				extractedContent: report,
			})
			.where(eq(message.id, messageId));

		return { report };
	} catch (error) {
		if (isRateLimitError(error)) {
			return {
				status: 'rate-limited' as const,
				error,
			};
		}

		if (APICallError.isInstance(error)) {
			if (!error.isRetryable) {
				throw new UnrecoverableError(error.message);
			}
		}

		throw error;
	}
}
