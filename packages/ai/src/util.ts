import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import type { JsonValue } from '@workspace/core/json.js';
import type { LanguageModel } from 'ai';
import sanitizeHtml from 'sanitize-html';

export const MODELS = {
	// GENERAL PURPOSE MODELS:
	// Use these models as a starting point for a wide range of general tasks.
	// Pick the best tool for the job, but don't proliferate too many different
	// models unless you have a good reason to do so. Try to upgrade these when possible.
	//
	// IMPORTANT: Gemini-only for now! Especially for any "runs on every message" tasks.
	// We do this to keep user data within the Google ecosystem, by default.
	'gemini-2.0-flash': google('gemini-2.0-flash-001'),
	'gemini-2.5-flash': google('gemini-2.5-flash'),
	'gemini-2.5-pro': google('gemini-2.5-pro'),

	// USE-CASE SPECIFIC MODELS:
	// Use these models for a certain kind of task. We group these by use-case
	// so that behavior stays consistent and optimized across different parts of the app.
	// (ex: all chat features should use the same model).
	/** CHAT -- Use this for assistant chat. */
	CHAT: openai('gpt-5-2025-08-07'),
	/** TOOL_USE -- Use this when tool use is required. Gemini is famously terrible at this. */
	TOOL_USE: openai('gpt-5-2025-08-07'),
	/** PDF -- Use this for PDF analysis / OCR. */
	PDF: google('gemini-2.0-flash-001'),
} satisfies Record<string, LanguageModel>;

type PromptAnswer = 'YES' | 'NO' | 'UNCERTAIN';
type PromptResult<T extends PromptAnswer> = { answer: T; reasoningText: string };
type PromptRunner<T extends PromptAnswer = PromptAnswer> = (
	message: { id: string },
	report: string,
) => Promise<PromptResult<T>>;

function definePromptRunner<T extends PromptAnswer = PromptAnswer>(runner: PromptRunner<T>) {
	return runner;
}

export function serializeReferenceThread(thread: {
	id: string;
	lastSentAt: Date;
	resolvedAt: Date | null;
	threadCategories?: {
		categoryId: string;
		data: JsonValue;
	}[];
	messages: {
		senderName: string | null;
		senderEmail: string;
		subject: string;
		snippet: string | null;
		deletedAt?: Date | null;
		draftId?: string | null;
		sentAt: Date | null;
		messageRecipients: {
			type: string;
			name: string | null;
			email: string;
		}[];
	}[];
}) {
	// Filter out only deleted messages (including deleted drafts)
	const filteredMessages = thread.messages.filter((m) => !m.deletedAt);

	return JSON.stringify({
		id: thread.id,
		lastSentAt: thread.lastSentAt,
		isResolved: !!thread.resolvedAt,
		subject: filteredMessages[0]?.subject,
		messages: filteredMessages.map((m) => ({
			from: m.senderName ? `${m.senderName} <${m.senderEmail}>` : m.senderEmail,
			to: m.messageRecipients.map((r) => `${r.type}: ${r.name} <${r.email}>`),
			snippet: m.snippet,
			isDraft: !!m.draftId,
			sentAt: m.sentAt,
		})),
		appData: thread.threadCategories,
	});
}

// TODO: Adapt this function to use the new thread structure from Drizzle so that we don't need to adjust the data first
export function serializeDetailedThread(thread: {
	id: string;
	lastSentAt: Date;
	resolvedAt: Date | null;
	threadCategories?: {
		categoryId: string;
		data: JsonValue;
	}[];
	messages: {
		senderName: string | null;
		senderEmail: string;
		subject: string;
		contentHtml: string | null;
		contentText: string | null;
		extractedContent: string | null;
		deletedAt?: Date | null;
		draftId?: string | null;
		sentAt: Date | null;
		messageRecipients: {
			type: string;
			name: string | null;
			email: string;
		}[];
	}[];
}) {
	// Filter out only deleted messages (including deleted drafts)
	const filteredMessages = thread.messages.filter((m) => !m.deletedAt);

	return JSON.stringify({
		id: thread.id,
		lastSentAt: thread.lastSentAt,
		resolvedAt: thread.resolvedAt,
		subject: filteredMessages[0]?.subject,
		messages: filteredMessages.map((m) => ({
			from: m.senderName ? `${m.senderName} <${m.senderEmail}>` : m.senderEmail,
			to: m.messageRecipients.map((r) => `${r.type}: ${r.name} <${r.email}>`),
			content:
				m.extractedContent ||
				(m.contentHtml
					? sanitizeHtml(m.contentHtml, {
							allowedTags: [],
							allowedAttributes: {},
						}).replace(/\s\s+/g, ' ')
					: m.contentText),
			isDraft: !!m.draftId,
			sentAt: m.sentAt,
		})),
		apps: thread.threadCategories,
	});
}
